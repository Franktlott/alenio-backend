/**
 * Registers Better Auth routes after the HTTP server is already listening.
 * Kept separate from index.ts boot so package/init failures cannot fail Railway /health.
 */
import type { Context, Hono } from "hono";
import { env } from "../env";
import { isTrustedAuthCallbackUrl, isMobileAuthDeepLink } from "./auth-callback-trust";
import { isAuthServerEnabled, loadAuthServer } from "./better-auth";
import { setBetterAuthMounted } from "./better-auth-status";
import { webAuthCallbackUrl, webPublicBaseUrl } from "./web-public-url";

/**
 * OAuth callbacks set a session cookie on the API host, then redirect to the SPA / app.
 * Cross-origin clients never see that cookie — append the bearer token so they can store it.
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
    const webBase = webPublicBaseUrl();

    if (url.origin === backendOrigin) {
      const next = new URL(`${webBase}/auth/callback`);
      url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
      if (url.hash) next.hash = url.hash;
      url = next;
    }

    // Never send users to retired hosts even if an old callbackURL was stored.
    if (url.hostname === "alenio.app" || url.hostname === "www.alenio.app") {
      const next = new URL(`${webBase}/auth/callback`);
      url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
      if (url.hash) next.hash = url.hash;
      url = next;
    }

    if (!isTrustedAuthCallbackUrl(url)) return res;

    if (authToken) {
      if (isMobileAuthDeepLink(url)) {
        // Query params are more reliable than hash for React Native Linking.
        url.searchParams.set("auth_token", authToken);
      } else {
        const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
        hash.set("auth_token", authToken);
        url.hash = hash.toString();
      }
    }

    const headers = new Headers(res.headers);
    headers.set("Location", url.toString());
    return new Response(null, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

/** First-party browser navigation so OAuth cookies are set on the API host (Safari-safe). */
async function startMicrosoftOAuth(c: Context): Promise<Response> {
  const authServer = await loadAuthServer();
  if (!authServer) {
    return c.text("Microsoft sign-in is not available.", 503);
  }

  let callbackURL = c.req.query("callbackURL")?.trim() || webAuthCallbackUrl();
  try {
    const cb = new URL(callbackURL);
    if (cb.hostname === "alenio.app" || cb.hostname === "www.alenio.app") {
      callbackURL = webAuthCallbackUrl();
    } else if (!isTrustedAuthCallbackUrl(cb)) {
      return c.text("Invalid callback URL.", 400);
    }
  } catch {
    return c.text("Invalid callback URL.", 400);
  }

  const signInUrl = new URL("/api/auth/sign-in/social", env.BACKEND_URL.replace(/\/$/, ""));
  const origin = c.req.header("origin") || webPublicBaseUrl();
  const internal = new Request(signInUrl.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: c.req.header("cookie") ?? "",
    },
    body: JSON.stringify({
      provider: "microsoft",
      callbackURL,
      errorCallbackURL: callbackURL,
      newUserCallbackURL: callbackURL,
    }),
  });

  const res = await authServer.handler(internal);

  const cookieHeaders = new Headers();
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  const cookies = getSetCookie ? getSetCookie() : [];
  for (const cookie of cookies) cookieHeaders.append("Set-Cookie", cookie);
  if (cookies.length === 0) {
    const single = res.headers.get("set-cookie");
    if (single) cookieHeaders.append("Set-Cookie", single);
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("Location");
    if (location) {
      cookieHeaders.set("Location", location);
      return new Response(null, { status: 302, headers: cookieHeaders });
    }
  }

  try {
    const data = (await res.clone().json()) as { url?: string; redirect?: boolean };
    if (data?.url) {
      cookieHeaders.set("Location", data.url);
      return new Response(null, { status: 302, headers: cookieHeaders });
    }
  } catch {
    /* fall through */
  }

  const detail = await res.text().catch(() => "");
  console.error("[better-auth] microsoft start failed", res.status, detail.slice(0, 500));
  return c.redirect(`${webAuthCallbackUrl()}?error=microsoft_start_failed`, 302);
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

  // Outside `/api/auth/*` so the catch-all does not swallow it.
  app.get("/api/oauth/microsoft/start", (c) => startMicrosoftOAuth(c));

  /**
   * Password reset request with real send outcome.
   * Unlike Better Auth's OTP endpoint, this returns an error when no Alenio account exists
   * so clients do not advance to the code screen incorrectly.
   */
  app.post("/api/password-reset/request", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return c.json(
        {
          success: false,
          delivered: false,
          error: { message: "Please enter your email address.", code: "INVALID_EMAIL" },
        },
        400,
      );
    }
    try {
      const outcome = await authServer.sendForgetPasswordOtp(email);
      console.log("[password-reset/request]", email, outcome);
      if (outcome === "sent") {
        return c.json({ success: true, delivered: true });
      }
      if (outcome === "no_user") {
        return c.json(
          {
            success: false,
            delivered: false,
            error: {
              message: "No Alenio account found for that email.",
              code: "NO_ACCOUNT",
            },
          },
          404,
        );
      }
      return c.json(
        {
          success: false,
          delivered: false,
          error: {
            message: "Could not send a reset email. Please try again shortly.",
            code: "SEND_FAILED",
          },
        },
        502,
      );
    } catch (err) {
      console.error("[password-reset/request] failed:", err);
      return c.json(
        {
          success: false,
          delivered: false,
          error: {
            message: "Could not send a reset email. Please try again shortly.",
            code: "SEND_FAILED",
          },
        },
        502,
      );
    }
  });

  // Hono 4.6: `/api/auth/*` matches nested paths (sign-in/email, email-otp/...).
  // `/api/auth/**` does NOT match those routes in this Hono version (returns 404).
  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    try {
      if (c.req.path.includes("/callback/") && !new URL(c.req.url).searchParams.get("state")) {
        console.error("[better-auth] OAuth callback missing state", c.req.path, c.req.url);
      }
      const res = await authServer.handler(c.req.raw);
      const withToken = maybeAttachBearerTokenToOAuthRedirect(c.req.path, res);
      const loc = withToken.headers.get("Location") || "";
      if (loc.includes("invalid_code") || loc.includes("error=")) {
        console.error(
          "[better-auth] OAuth redirect error",
          c.req.path,
          loc.slice(0, 300),
          "hint=check Entra redirect URI equals BACKEND_URL/api/auth/callback/microsoft and client secret",
        );
      }
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
