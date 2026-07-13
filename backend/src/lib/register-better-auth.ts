/**
 * Registers Better Auth routes after the HTTP server is already listening.
 * Kept separate from index.ts boot so package/init failures cannot fail Railway /health.
 */
import type { Hono } from "hono";
import { isAuthServerEnabled, loadAuthServer } from "./better-auth";

export async function registerBetterAuthRoutes(app: Hono): Promise<boolean> {
  if (!isAuthServerEnabled) {
    console.log(
      "[better-auth] Not enabled — set BETTER_AUTH_SECRET (32+ chars) and a Postgres DATABASE_URL to enable.",
    );
    return false;
  }

  const authServer = await loadAuthServer();
  if (!authServer) {
    console.error("[better-auth] Enabled in env but failed to initialize; routes not mounted.");
    return false;
  }

  app.on(["POST", "GET"], "/api/auth/**", (c) => authServer.handler(c.req.raw));
  console.log("[better-auth] Mounted /api/auth/** (neon_auth schema)");
  return true;
}
