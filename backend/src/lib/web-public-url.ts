import { env } from "../env";

const PRODUCTION_WEB = "https://alenio.com";

/** Domains we no longer serve — never send users here. */
const RETIRED_WEB_HOSTS = new Set(["alenio.app", "www.alenio.app"]);

/**
 * Public website origin for OAuth returns, invites, etc.
 * Ignores retired hosts (e.g. alenio.app) even if still set on Railway.
 */
export function webPublicBaseUrl(): string {
  const raw = env.WEB_PUBLIC_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (!RETIRED_WEB_HOSTS.has(u.hostname.toLowerCase())) {
        return u.origin;
      }
    } catch {
      /* fall through */
    }
  }
  return PRODUCTION_WEB;
}

export function webAuthCallbackUrl(): string {
  return `${webPublicBaseUrl()}/auth/callback`;
}
