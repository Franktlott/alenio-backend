const STORAGE_KEY = "alenio-enterprise:access-token";

export function looksLikeJwt(v: string): boolean {
  return v.split(".").length === 3;
}

/** True if JWT `exp` is in the past (or missing / malformed). Used to avoid treating dead sessions as signed-in. */
export function isJwtExpiredSkew(token: string, skewMs = 30_000): boolean {
  if (!looksLikeJwt(token)) return true;
  try {
    const parts = token.split(".");
    let base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json =
      typeof atob !== "undefined"
        ? atob(base64)
        : typeof Buffer !== "undefined"
          ? Buffer.from(base64, "base64").toString("utf8")
          : null;
    if (!json) return true;
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= payload.exp * 1000 - skewMs;
  } catch {
    return true;
  }
}

/**
 * Session usable for web gates.
 * Neon Auth used JWTs; Better Auth bearer sessions are opaque strings.
 */
export function isSessionTokenUsable(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  if (!t) return false;
  if (looksLikeJwt(t)) return !isJwtExpiredSkew(t);
  return true;
}

export function isSessionTokenExpired(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  if (!t) return true;
  if (looksLikeJwt(t)) return isJwtExpiredSkew(t);
  return false;
}

function pickTokenFromUnknown(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const direct =
    (typeof rec.token === "string" ? rec.token : null) ??
    (typeof rec.accessToken === "string" ? rec.accessToken : null) ??
    (typeof rec.access_token === "string" ? rec.access_token : null);
  if (direct?.trim()) return direct.trim();
  const nestedSession = rec.session;
  if (nestedSession && typeof nestedSession === "object") {
    const s = nestedSession as Record<string, unknown>;
    const nested =
      (typeof s.token === "string" ? s.token : null) ??
      (typeof s.accessToken === "string" ? s.accessToken : null) ??
      (typeof s.access_token === "string" ? s.access_token : null);
    if (nested?.trim()) return nested.trim();
  }
  return null;
}

function deepFindToken(data: unknown, depth = 0): string | null {
  if (!data || depth > 5) return null;
  if (typeof data === "string") {
    const t = data.trim();
    if (!t) return null;
    return looksLikeJwt(t) ? t : null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = deepFindToken(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      const found = deepFindToken(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function extractTokenFromAuthPayload(data: unknown): string | null {
  return pickTokenFromUnknown(data) ?? deepFindToken(data);
}

export function getStoredToken(): string | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY)?.trim();
    return t || null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
