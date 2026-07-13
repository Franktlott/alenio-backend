/**
 * Shared OAuth / post-login redirect trust checks.
 * Web uses HTTPS origins; mobile uses the app scheme (alenio://) or Expo Go (exp://).
 */
import { env } from "../env";
import { webPublicBaseUrl } from "./web-public-url";

export function appDeepLinkScheme(): string {
  return (env.APP_SCHEME?.trim() || "alenio").toLowerCase().replace(/:$/, "");
}

export function isMobileAuthDeepLink(url: URL): boolean {
  const protocol = url.protocol.toLowerCase();
  const scheme = appDeepLinkScheme();
  return protocol === `${scheme}:` || protocol === "exp:" || protocol === "exps:";
}

export function isTrustedAuthCallbackUrl(url: URL): boolean {
  if (isMobileAuthDeepLink(url)) return true;

  const allowed = new Set<string>([
    "https://alenio.com",
    "https://www.alenio.com",
    "https://alenio---prod.web.app",
    "https://alenio---prod.firebaseapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  try {
    allowed.add(webPublicBaseUrl());
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

/** Patterns for Better Auth `trustedOrigins` (custom schemes use startsWith matching). */
export function mobileTrustedOriginPatterns(): string[] {
  const scheme = appDeepLinkScheme();
  return [`${scheme}://`, "exp://", "exps://"];
}
