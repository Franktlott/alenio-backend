const STORAGE_KEY = "alenio-enterprise:access-token";

export function looksLikeJwt(v: string): boolean {
  return v.split(".").length === 3;
}

function pickTokenFromUnknown(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const direct =
    (typeof rec.token === "string" ? rec.token : null) ??
    (typeof rec.accessToken === "string" ? rec.accessToken : null) ??
    (typeof rec.access_token === "string" ? rec.access_token : null);
  if (direct) return direct;
  const nestedSession = rec.session;
  if (nestedSession && typeof nestedSession === "object") {
    const s = nestedSession as Record<string, unknown>;
    return (
      (typeof s.token === "string" ? s.token : null) ??
      (typeof s.accessToken === "string" ? s.accessToken : null) ??
      (typeof s.access_token === "string" ? s.access_token : null)
    );
  }
  return null;
}

function deepFindToken(data: unknown, depth = 0): string | null {
  if (!data || depth > 5) return null;
  if (typeof data === "string") {
    return looksLikeJwt(data) ? data : null;
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
