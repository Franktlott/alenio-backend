/**
 * Registers Better Auth routes after the HTTP server is already listening.
 * Kept separate from index.ts boot so package/init failures cannot fail Railway /health.
 */
import type { Hono } from "hono";
import { env } from "../env";
import { isAuthServerEnabled, loadAuthServer } from "./better-auth";
import { setBetterAuthMounted } from "./better-auth-status";

function isTrustedFrontendRedirect(url: URL): boolean {
  const allowed = new Set<string>([
    "https://alenio.com",
    "https://www.alenio.com",
    "https://alenio.app",
    "https://www.alenio.app",
    "https://alenio---prod.web.app",
    "https://alenio---prod.firebaseapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  try {
    if (env.WEB_PUBLIC_URL) allowed.add(new URL(env.WEB_PUBLIC_URL).origin);
  } catch {
    /* ignore */
  }
  for (const part of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const o = part.trim().replace(/\/$/, "");
    if (o) {
      try {
        allowed.add(new URL(o).origin);
      } catch {
        /* ignore */
      }
    }
  }
  return allowed.has(url.origin);
}

/**
 * OAuth callbacks set a session cookie on the API host, then redirect to the SPA.
 * Cross-origin SPAs never see that cookie — append the bearer token in the URL hash
 * so the web callback page can store it (hash is not sent to servers).
 *
 * Also: if Better Auth fell back to `baseURL` (API origin) as callbackURL, rewrite
 * the redirect to the real web app so users don't land on the API homepage.
 */
function maybeAttachBearerTokenToOAuthRedirect(requestPath: string, res: Response): Response {
  if (!requestPath.includes("/callback/")) return res;
  if (res.status < 300 || res.status >= 400) return res;

  const location = res.headers.get("Location");
  const authToken = res.headers.get("set-auth-token")?.trim();
  if (!location) return res;

  try {
    let url = new URL(location, env.BACKEND_URL.replace(/\/$/, ""));
    const backendOrigin = new URL(env.BACKEND_URL.replace(/\/$/, "")).origin;
    const webBase = (env.WEB_PUBLIC_URL?.trim() || "https://alenio.com").replace(/\/$/, "");

    if (url.origin === backendOrigin) {
      url = new URL(`${webBase}/auth/callback`);
    }

    if (!isTrustedFrontendRedirect(url)) return res;

    if (authToken) {
      const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
      hash.set("auth_token", authToken);
      url.hash = hash.toString();
    }

    const headers = new Headers(res.headers);
    headers.set("Location", url.toString());
    return new Response(null, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

export async function registerBetterAuthRoutes(app: Hono): Promise<boolean> {
  if (!isAuthServerEnabled) {
    console.log(
      "[better-auth] Not enabled — set BETTER_AUTH_SECRET (32+ chars) and a Postgres DATABASE_URL to enable.",
    );
    setBetterAuthMounted(false);
    return false;
  }

  const authServer = await loadAuthServer();
  if (!authServer) {
    console.error("[better-auth] Enabled in env but failed to initialize; routes not mounted.");
    setBetterAuthMounted(false);
    return false;
  }

  // Hono 4.6: `/api/auth/*` matches nested paths (sign-in/email, email-otp/...).
  // `/api/auth/**` does NOT match those routes in this Hono version (returns 404).
  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    try {
      const res = await authServer.handler(c.req.raw);
      const withToken = maybeAttachBearerTokenToOAuthRedirect(c.req.path, res);
      if (withToken.status >= 500) {
        const detail = await withToken.clone().text().catch(() => "");
        console.error("[better-auth] upstream", withToken.status, c.req.path, detail.slice(0, 800));
        return c.json(
          {
            error: {
              message: detail.trim() || "Better Auth request failed",
              path: c.req.path,
              code: "BETTER_AUTH_UPSTREAM_500",
              detail: detail.slice(0, 800) || null,
              statusText: withToken.statusText || null,
            },
          },
          500,
        );
      }
      return withToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.slice(0, 800) : null;
      console.error("[better-auth] handler threw:", message, err);
      return c.json(
        {
          error: {
            message: "Better Auth request failed",
            detail: message,
            stack,
            code: "BETTER_AUTH_HANDLER_ERROR",
          },
        },
        500,
      );
    }
  });
  setBetterAuthMounted(true);
  const ms =
    env.MICROSOFT_CLIENT_ID?.trim() && env.MICROSOFT_CLIENT_SECRET?.trim()
      ? " (microsoft social enabled)"
      : "";
  console.log(`[better-auth] Mounted /api/auth/* (neon_auth schema)${ms}`);
  return true;
}
