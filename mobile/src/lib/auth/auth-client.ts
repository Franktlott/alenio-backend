import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

const neonAuthUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL;

if (!neonAuthUrl) {
  throw new Error("Missing EXPO_PUBLIC_NEON_AUTH_URL");
}

const neonAuthOrigin = (() => {
  try {
    return new URL(neonAuthUrl.trim()).origin;
  } catch {
    return "";
  }
})();

/**
 * Absolute HTTPS URL Better Auth accepts as callbackURL (trustedOrigins).
 * Custom schemes (alenio://, exp://) are rejected as "invalid callback url" unless added in Neon.
 */
export function getEmailAuthCallbackUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).toString();
    } catch {
      /* ignore bad env */
    }
  }

  const backend = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (backend) {
    const normalized = backend.replace(/\/+$/, "");
    return `${normalized}/`;
  }

  if (neonAuthOrigin) {
    return `${neonAuthOrigin}/`;
  }

  const schemeConfig = Constants.expoConfig?.scheme;
  const scheme =
    typeof schemeConfig === "string"
      ? schemeConfig
      : Array.isArray(schemeConfig)
        ? schemeConfig[0]
        : "alenio";
  return Linking.createURL("/", { scheme: scheme ?? "alenio" });
}

function nativeAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);
  if (neonAuthOrigin && !headers.has("Origin")) {
    headers.set("Origin", neonAuthOrigin);
  }
  if (neonAuthOrigin && !headers.has("Referer")) {
    headers.set("Referer", `${neonAuthOrigin}/`);
  }
  // RN often cannot reliably send browser cookies/origin semantics.
  // Use token-based session transport to avoid Better Auth cookie CSRF origin checks.
  return (expoFetch as typeof fetch)(input, { ...init, headers, credentials: "omit" });
}

/** Neon Auth + Expo fetch; sets Origin so CSRF / callback checks succeed on native. */
export const authClient = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthVanillaAdapter({
    fetchOptions: {
      headers: neonAuthOrigin
        ? {
            Origin: neonAuthOrigin,
            Referer: `${neonAuthOrigin}/`,
          }
        : undefined,
      customFetchImpl: nativeAuthFetch as typeof fetch,
    },
  }),
});

type SessionShape = {
  session?: {
    accessToken?: string;
    access_token?: string;
    token?: string;
  } | null;
};

let inMemoryAccessToken: string | null = null;
const ACCESS_TOKEN_KEY = "alenio:access-token";

function pickSessionToken(data: SessionShape | null): string | null {
  const session = data?.session;
  return session?.accessToken ?? session?.access_token ?? session?.token ?? null;
}

export function setAccessToken(token: string | null | undefined) {
  const normalized = token?.trim() ? token.trim() : null;
  inMemoryAccessToken = normalized;
  if (normalized) {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, normalized).catch(() => {});
  } else {
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
  }
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
  AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
}

function pickTokenFromUnknown(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const direct =
    (typeof rec.token === "string" ? rec.token : null) ??
    (typeof rec.accessToken === "string" ? rec.accessToken : null) ??
    (typeof rec.access_token === "string" ? rec.access_token : null) ??
    (typeof rec.sessionToken === "string" ? rec.sessionToken : null) ??
    (typeof rec.bearerToken === "string" ? rec.bearerToken : null);
  if (direct) return direct;
  const nestedSession = rec.session;
  if (nestedSession && typeof nestedSession === "object") {
    const s = nestedSession as Record<string, unknown>;
    return (
      (typeof s.token === "string" ? s.token : null) ??
      (typeof s.accessToken === "string" ? s.accessToken : null) ??
      (typeof s.access_token === "string" ? s.access_token : null) ??
      (typeof s.sessionToken === "string" ? s.sessionToken : null) ??
      (typeof s.bearerToken === "string" ? s.bearerToken : null)
    );
  }
  return null;
}

function looksLikeJwt(v: string): boolean {
  return v.split(".").length === 3;
}

/** JWT `exp` claim in ms, or null if missing / not a JWT payload. */
function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    let decoded: string;
    if (typeof atob !== "undefined") {
      decoded = atob(base64);
    } else if (typeof Buffer !== "undefined") {
      decoded = Buffer.from(base64, "base64").toString("utf8");
    } else {
      return null;
    }
    const payload = JSON.parse(decoded) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Refresh access token this many minutes before JWT expiry (consumer-app style stay logged in). */
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
/** Clock skew: treat JWT as expired this many ms before `exp`. */
const JWT_EXPIRY_SKEW_MS = 30 * 1000;

function shouldProactivelyRefreshJwt(token: string): boolean {
  const expMs = decodeJwtExpMs(token);
  if (!expMs) return false;
  return expMs - REFRESH_BEFORE_EXPIRY_MS <= Date.now();
}

function isJwtExpiredBeyondGrace(token: string): boolean {
  const expMs = decodeJwtExpMs(token);
  if (!expMs) return false;
  return Date.now() >= expMs - JWT_EXPIRY_SKEW_MS;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Ask Neon Auth for an updated session/JWT using the current bearer (force network).
 * Call when a JWT is near expiry or after a 401, before signing the user out.
 */
export async function refreshSessionTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<boolean> => {
    try {
      let bearer = inMemoryAccessToken?.trim() ?? null;
      if (!bearer) {
        try {
          bearer = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY))?.trim() ?? null;
        } catch {
          bearer = null;
        }
      }
      if (!bearer) return false;

      const forced = await authClient.getSession({
        fetchOptions: {
          headers: {
            "X-Force-Fetch": "1",
            Authorization: `Bearer ${bearer}`,
          },
        },
      } as never);

      const next =
        setAccessTokenFromAuthData(forced?.data ?? null) ??
        setAccessTokenFromAuthData(forced ?? null);
      return !!next;
    } catch {
      return false;
    }
  };

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** When returning to the app, refresh if the access token expires within this window. */
const FOREGROUND_REFRESH_WITHIN_MS = 12 * 60 * 1000;

export async function ensureSessionFreshOnForeground(): Promise<void> {
  try {
    let token = inMemoryAccessToken?.trim() ?? null;
    if (!token) token = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY))?.trim() ?? null;
    if (!token || !looksLikeJwt(token)) return;
    const expMs = decodeJwtExpMs(token);
    if (!expMs) return;
    if (expMs - Date.now() > FOREGROUND_REFRESH_WITHIN_MS) return;
    await refreshSessionTokens();
  } catch {
    /* ignore */
  }
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
  if (typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const keyCandidates = ["token", "accessToken", "access_token", "sessionToken", "bearerToken", "jwt"];
  for (const key of keyCandidates) {
    const val = rec[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  for (const val of Object.values(rec)) {
    const found = deepFindToken(val, depth + 1);
    if (found) return found;
  }
  return null;
}

export function setAccessTokenFromAuthData(data: unknown): string | null {
  const token = pickTokenFromUnknown(data) ?? deepFindToken(data);
  if (token) setAccessToken(token);
  return token;
}

async function getJwtTokenFromClient(): Promise<string | null> {
  const client = authClient as unknown as {
    getJWTToken?: () => Promise<unknown>;
    getJwtToken?: () => Promise<unknown>;
  };
  try {
    const value = client.getJWTToken ? await client.getJWTToken() : client.getJwtToken ? await client.getJwtToken() : null;
    if (typeof value === "string" && value.trim()) return value.trim();
    const picked = pickTokenFromUnknown(value) ?? deepFindToken(value);
    return picked ?? null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  async function loadFromStorage(): Promise<string | null> {
    if (inMemoryAccessToken?.trim()) return inMemoryAccessToken.trim();
    try {
      const stored = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      if (stored?.trim()) {
        inMemoryAccessToken = stored.trim();
        return inMemoryAccessToken;
      }
    } catch {
      // ignore storage read errors and continue
    }
    return null;
  }

  let token = await loadFromStorage();

  if (token && looksLikeJwt(token)) {
    if (shouldProactivelyRefreshJwt(token) || isJwtExpiredBeyondGrace(token)) {
      await refreshSessionTokens();
      token = await loadFromStorage();
    }
    if (token && (!looksLikeJwt(token) || !isJwtExpiredBeyondGrace(token))) {
      return token.trim();
    }
  } else if (token?.trim()) {
    return token.trim();
  }

  token = await getJwtTokenFromClient();
  if (token) {
    setAccessToken(token);
    return token;
  }

  token = null;
  try {
    const result = await authClient.getSession();
    const data = (result?.data ?? null) as SessionShape | null;
    token =
      pickSessionToken(data) ??
      pickTokenFromUnknown(result?.data ?? null) ??
      pickTokenFromUnknown(result ?? null);
  } catch {
    token = null;
  }
  if (token) {
    setAccessToken(token);
    return token;
  }

  // Fallback: bypass potential stale client cache and force a network read once.
  try {
    const forced = await authClient.getSession({
      fetchOptions: {
        headers: { "X-Force-Fetch": "1" },
      },
    } as never);
    token =
      pickSessionToken((forced?.data ?? null) as SessionShape | null) ??
      pickTokenFromUnknown(forced?.data ?? null) ??
      pickTokenFromUnknown(forced ?? null);
  } catch {
    // ignore and return null below
  }

  if (token) {
    setAccessToken(token);
    return token;
  }

  token = await getJwtTokenFromClient();
  if (token) {
    setAccessToken(token);
    return token;
  }

  return inMemoryAccessToken;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
