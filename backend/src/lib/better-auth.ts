/**
 * Self-hosted Better Auth (Phase 1+).
 * Reuses Neon Auth tables in the `neon_auth` schema via Postgres search_path.
 * Mobile/web still use Neon Auth until Phase 3–4; this mounts `/api/auth/*` for cutover.
 */
import { betterAuth } from "better-auth";
import { bearer, emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";
import { env } from "../env";

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

export const isAuthServerEnabled =
  Boolean(env.BETTER_AUTH_SECRET?.trim()) && isPostgresUrl(env.DATABASE_URL);

let authServerInstance: ReturnType<typeof betterAuth> | null = null;

function createAuthServer() {
  const secret = env.BETTER_AUTH_SECRET!.trim();
  const pool = new Pool({
    connectionString: withNeonAuthSearchPath(env.DATABASE_URL),
  });

  return betterAuth({
    appName: "Alenio",
    baseURL: env.BACKEND_URL.replace(/\/$/, ""),
    secret,
    database: pool,
    trustedOrigins: collectTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      // Match product: verify via email OTP after sign-up
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
}

/** Better Auth instance when `BETTER_AUTH_SECRET` + Postgres DATABASE_URL are set. */
export function getAuthServer(): ReturnType<typeof betterAuth> {
  if (!isAuthServerEnabled) {
    throw new Error(
      "Better Auth is not enabled. Set BETTER_AUTH_SECRET (32+ chars) and a Postgres DATABASE_URL.",
    );
  }
  if (!authServerInstance) {
    authServerInstance = createAuthServer();
  }
  return authServerInstance;
}

export function tryGetAuthServer(): ReturnType<typeof betterAuth> | null {
  if (!isAuthServerEnabled) return null;
  try {
    return getAuthServer();
  } catch (err) {
    console.error("[better-auth] failed to init:", err);
    return null;
  }
}
