import { Pool } from "pg";
import { Resend } from "resend";
import { env } from "../env";
import { mobileTrustedOriginPatterns } from "./auth-callback-trust";
import { webAuthCallbackUrl, webPublicBaseUrl } from "./web-public-url";

/**
 * Self-hosted Better Auth.
 * Reuses auth tables in the `neon_auth` schema via Postgres search_path.
 * Clients talk to `/api/auth/*` on this API (Bearer for mobile/web SPA).
 */

type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
};

export type AuthServer = {
  handler: (request: Request) => Promise<Response>;
  getSessionFromHeaders: (
    headers: Headers,
  ) => Promise<{ user: SessionUser; expiresAt: Date | null; token: string | null } | null>;
  verifyEmailPassword: (email: string, password: string) => Promise<boolean>;
  createEmailPasswordUser: (email: string, password: string, name: string) => Promise<boolean>;
  sendEmailVerificationOtp: (email: string) => Promise<void>;
  verifyEmailVerificationOtp: (email: string, otp: string) => Promise<void>;
  /** Returns whether an OTP email was actually handed to Resend. */
  sendForgetPasswordOtp: (email: string) => Promise<"sent" | "no_user" | "error">;
};

function isPostgresUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("postgres://") || u.startsWith("postgresql://");
}

/**
 * Neon pooler often ignores `options=-c search_path=...` in the URL.
 * Ensure every checked-out client uses neon_auth before Better Auth queries.
 */
function createAuthPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  const originalConnect = pool.connect.bind(pool);

  pool.connect = ((...args: Parameters<Pool["connect"]>) => {
    const callback = typeof args[0] === "function" ? args[0] : undefined;
    if (callback) {
      return originalConnect(async (err, client, done) => {
        if (err || !client) {
          callback(err, client as never, done);
          return;
        }
        try {
          await client.query('SET search_path TO "neon_auth", public');
          callback(undefined, client, done);
        } catch (setErr) {
          done();
          callback(setErr as Error, undefined as never, done);
        }
      });
    }

    return originalConnect().then(async (client) => {
      try {
        await client.query('SET search_path TO "neon_auth", public');
        return client;
      } catch (setErr) {
        client.release();
        throw setErr;
      }
    });
  }) as Pool["connect"];

  return pool;
}

function collectTrustedOrigins(): string[] {
  const origins = new Set<string>([
    "https://alenio.com",
    "https://www.alenio.com",
    "https://alenio---prod.web.app",
    "https://alenio---prod.firebaseapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  try {
    origins.add(new URL(env.BACKEND_URL).origin);
  } catch {
    /* ignore */
  }
  try {
    origins.add(webPublicBaseUrl());
  } catch {
    /* ignore */
  }

  for (const part of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const o = part.trim();
    if (o) origins.add(o.replace(/\/$/, ""));
  }

  for (const pattern of mobileTrustedOriginPatterns()) {
    origins.add(pattern);
  }

  return [...origins];
}

export const isAuthServerEnabled = (() => {
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) return false;
  return isPostgresUrl(env.DATABASE_URL);
})();

let authServerPromise: Promise<AuthServer | null> | null = null;

function readBearerToken(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token?.length ? token : null;
}

async function createAuthServer(): Promise<AuthServer | null> {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || !isPostgresUrl(env.DATABASE_URL)) {
    return null;
  }

  try {
    const [{ betterAuth }, { bearer, emailOTP }] = await Promise.all([
      import("better-auth"),
      import("better-auth/plugins"),
    ]);

    const pool = createAuthPool(env.DATABASE_URL);

    const microsoftClientId = env.MICROSOFT_CLIENT_ID?.trim() ?? "";
    const microsoftClientSecret = env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
    const microsoftEnabled = microsoftClientId.length > 0 && microsoftClientSecret.length > 0;

    const auth = betterAuth({
      appName: "Alenio",
      baseURL: env.BACKEND_URL.replace(/\/$/, ""),
      secret,
      database: pool,
      trustedOrigins: collectTrustedOrigins(),
      // Neon Auth tables use uuid PKs; default nanoid ids fail inserts (OTP / sessions → 500).
      advanced: {
        database: {
          generateId: "uuid",
        },
      },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
      // After OTP verify, create a session + return bearer token (SPA cannot rely on cookies cross-origin).
      emailVerification: {
        autoSignInAfterVerification: true,
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: microsoftEnabled ? ["microsoft"] : [],
        },
        // SPA on alenio.com + API on Railway: Safari blocks cross-site auth cookies.
        // OAuth state lives in the DB; skip the extra cookie check on callback.
        skipStateCookieCheck: true,
      },
      socialProviders: microsoftEnabled
        ? {
            microsoft: {
              clientId: microsoftClientId,
              clientSecret: microsoftClientSecret,
              tenantId: env.MICROSOFT_TENANT_ID?.trim() || "common",
              prompt: "select_account",
              // Entra can return huge base64 profile photos that break headers.
              // Only strip image — keep name/email so public.User sync can provision the row.
              mapProfileToUser: (profile: Record<string, unknown>) => {
                const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
                return {
                  name: str(profile.name) || str(profile.displayName) || undefined,
                  email:
                    str(profile.email) ||
                    str(profile.mail) ||
                    str(profile.userPrincipalName) ||
                    undefined,
                  image: undefined,
                };
              },
            },
          }
        : {},
      onAPIError: {
        errorURL: webAuthCallbackUrl(),
      },
      plugins: [
        bearer(),
        emailOTP({
          overrideDefaultEmailVerification: true,
          sendVerificationOnSignUp: true,
          async sendVerificationOTP({ email, otp, type }) {
            if (!env.RESEND_API_KEY) {
              console.warn(
                "[better-auth] RESEND_API_KEY missing; OTP for",
                type,
                "not sent to",
                email,
                "code=",
                otp,
              );
              return;
            }
            const resend = new Resend(env.RESEND_API_KEY);
            const { buildAuthOtpEmail } = await import("./auth-otp-email");
            const mail = buildAuthOtpEmail({ type, otp, toEmail: email });

            const { data, error } = await resend.emails.send({
              from: env.FROM_EMAIL,
              to: email,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            });
            if (error) {
              console.error("[better-auth] Resend OTP error:", JSON.stringify(error));
              throw new Error(
                typeof error === "object" && error && "message" in error
                  ? `Email send failed: ${String((error as { message?: string }).message)}`
                  : "Email send failed. Check FROM_EMAIL / Resend domain.",
              );
            }
            console.log(
              "[better-auth] Resend OTP sent",
              type,
              "to=",
              email,
              "id=",
              data?.id ?? "unknown",
            );
          },
        }),
      ],
    });

    return {
      handler: (request: Request) => auth.handler(request),
      async getSessionFromHeaders(headers: Headers) {
        try {
          const session = await auth.api.getSession({ headers });
          const user = session?.user;
          const id = user?.id?.trim();
          if (!id || !user) return null;
          const expiresAtRaw = session?.session?.expiresAt;
          const expiresAt =
            expiresAtRaw == null
              ? null
              : expiresAtRaw instanceof Date
                ? expiresAtRaw
                : new Date(expiresAtRaw);
          return {
            user: {
              id,
              email: user.email ?? null,
              name: user.name ?? null,
              image: user.image ?? null,
            },
            expiresAt,
            token: readBearerToken(headers) ?? session?.session?.token ?? null,
          };
        } catch (err) {
          console.warn("[better-auth] getSession failed:", err);
          return null;
        }
      },
      async verifyEmailPassword(email: string, password: string) {
        try {
          await auth.api.signInEmail({
            body: { email: email.trim().toLowerCase(), password },
          });
          return true;
        } catch {
          return false;
        }
      },
      async createEmailPasswordUser(email: string, password: string, name: string) {
        try {
          await auth.api.signUpEmail({
            body: {
              email: email.trim().toLowerCase(),
              password,
              name: name.trim() || email.trim().toLowerCase(),
            },
          });
          return true;
        } catch (err) {
          console.warn("[better-auth] signUpEmail failed:", err);
          return false;
        }
      },
      async sendEmailVerificationOtp(email: string) {
        await auth.api.sendVerificationOTP({
          body: {
            email: email.trim().toLowerCase(),
            type: "email-verification",
          },
        });
      },
      async verifyEmailVerificationOtp(email: string, otp: string) {
        await auth.api.checkVerificationOTP({
          body: {
            email: email.trim().toLowerCase(),
            otp,
            type: "email-verification",
          },
        });
      },
      async sendForgetPasswordOtp(email: string) {
        const normalized = email.trim().toLowerCase();
        if (!normalized) return "no_user";

        // Better Auth's HTTP handler returns success without emailing when the user
        // is missing. Check neon_auth first so we can log the real outcome.
        const client = await pool.connect();
        let exists = false;
        try {
          const found = await client.query<{ id: string }>(
            `SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1`,
            [normalized],
          );
          exists = (found.rowCount ?? 0) > 0;
        } catch (err) {
          console.error("[better-auth] forget-password user lookup failed:", err);
          client.release();
          return "error";
        }
        client.release();

        if (!exists) {
          console.warn("[better-auth] forget-password skipped; no neon_auth user for", normalized);
          return "no_user";
        }

        try {
          await auth.api.sendVerificationOTP({
            body: {
              email: normalized,
              type: "forget-password",
            },
          });
          console.log("[better-auth] forget-password OTP requested for", normalized);
          return "sent";
        } catch (err) {
          console.error("[better-auth] forget-password OTP send failed:", err);
          return "error";
        }
      },
    };
  } catch (err) {
    console.error("[better-auth] failed to initialize:", err);
    return null;
  }
}

/** Lazily create Better Auth once. Never throws. */
export function loadAuthServer(): Promise<AuthServer | null> {
  if (!isAuthServerEnabled) return Promise.resolve(null);
  if (!authServerPromise) {
    authServerPromise = createAuthServer();
  }
  return authServerPromise;
}
