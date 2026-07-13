/**
 * Registers Better Auth routes after the HTTP server is already listening.
 * Kept separate from index.ts boot so package/init failures cannot fail Railway /health.
 */
import type { Hono } from "hono";
import { isAuthServerEnabled, loadAuthServer } from "./better-auth";
import { setBetterAuthMounted } from "./better-auth-status";

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
      if (res.status >= 500) {
        const detail = await res.clone().text().catch(() => "");
        console.error("[better-auth] upstream", res.status, c.req.path, detail.slice(0, 800));
        return c.json(
          {
            error: {
              message: detail.trim() || "Better Auth request failed",
              path: c.req.path,
              code: "BETTER_AUTH_UPSTREAM_500",
              detail: detail.slice(0, 800) || null,
              statusText: res.statusText || null,
            },
          },
          500,
        );
      }
      return res;
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
  console.log("[better-auth] Mounted /api/auth/* (neon_auth schema)");
  return true;
}
