/**
 * Self-hosted Better Auth (Phase 1+).
 * Reuses Neon Auth tables in the `neon_auth` schema via Postgres search_path.
 * Mobile/web still use Neon Auth until Phase 3–4; this mounts `/api/auth/*` for cutover.
 *
 * Better Auth is loaded lazily so a package/init failure cannot prevent the API from booting
 * while Neon Auth remains the live login path.
 */
import { Pool } from "pg";
import { Resend } from "resend";
import { env } from "../env";

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
};

function isPostgresUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("postgres://") || u.startsWith("postgresql://");
}

function withNeonAuthSearchPath(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const existing = url.searchParams.get("options") ?? "";
    if (/search_path\s*=\s*neon_auth/i.test(existing)) {
      return connectionString;
    }
    const next = existing
      ? `${existing} -c search_path=neon_auth`
      : `-c search_path=neon_auth`;
    url.searchParams.set("options", next);
    return url.toString();
  } catch {
    const sep = connectionString.includes("?") ? "&" : "?";
    return `${connectionString}${sep}options=-c%20search_path%3Dneon_auth`;
  }
}

function collectTrustedOrigins(): string[] {
  const origins = new Set<string>([
    "https://alenio.com",
    "https://www.alenio.com",
    "https://alenio.app",
    "https://www.alenio.app",
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
    if (env.WEB_PUBLIC_URL) origins.add(new URL(env.WEB_PUBLIC_URL).origin);
  } catch {
    /* ignore */
  }

  for (const part of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const o = part.trim();
    if (o) origins.add(o.replace(/\/$/, ""));
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

    const pool = new Pool({
      connectionString: withNeonAuthSearchPath(env.DATABASE_URL),
    });

    const auth = betterAuth({
      appName: "Alenio",
      baseURL: env.BACKEND_URL.replace(/\/$/, ""),
      secret,
      database: pool,
      trustedOrigins: collectTrustedOrigins(),
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
      plugins: [
        bearer(),
        emailOTP({
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
            const subject =
              type === "email-verification"
                ? "Verify your Alenio email"
                : type === "forget-password"
                  ? "Reset your Alenio password"
                  : "Your Alenio sign-in code";
            const intro =
              type === "email-verification"
                ? "Use this code to verify your email:"
                : type === "forget-password"
                  ? "Use this code to reset your password:"
                  : "Use this code to sign in:";

            const { error } = await resend.emails.send({
              from: env.FROM_EMAIL,
              to: email,
              subject,
              html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px">
                <h2 style="color:#4361EE;margin:0 0 12px">Alenio</h2>
                <p style="color:#334155;line-height:1.5">${intro}</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#0F172A;margin:20px 0">${otp}</p>
                <p style="color:#64748B;font-size:13px">This code expires shortly. If you did not request it, you can ignore this email.</p>
              </div>
            `,
            });
            if (error) {
              console.error("[better-auth] Resend OTP error:", error);
              throw new Error("Failed to send verification email");
            }
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
          if (!id) return null;
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
    };
  } catch (err) {
    console.error("[better-auth] failed to initialize (API will keep using Neon Auth):", err);
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
