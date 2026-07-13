/**
 * Better Auth client for mobile (Phase 4).
 * Auth base = EXPO_PUBLIC_BACKEND_URL → `/api/auth/*` (same as web).
 */
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBackendUrl } from "../backend-url";

const ACCESS_TOKEN_KEY = "alenio:access-token";

let inMemoryAccessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

/** Absolute HTTPS URL Better Auth may accept as callbackURL (OAuth / email links). */
export function getEmailAuthCallbackUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).toString();
    } catch {
      /* ignore bad env */
    }
  }

  try {
    return `${getBackendUrl()}/`;
  } catch {
    /* fall through */
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

function looksLikeJwt(v: string): boolean {
  return v.split(".").length === 3;
}

function jwtSubject(token: string): string | null {
  if (!looksLikeJwt(token)) return null;
  try {
    let base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    let decoded: string;
    if (typeof atob !== "undefined") decoded = atob(base64);
    else if (typeof Buffer !== "undefined") decoded = Buffer.from(base64, "base64").toString("utf8");
    else return null;
    const payload = JSON.parse(decoded) as { sub?: string };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function jwtSubPrefix(token: string | null | undefined): string | null {
  if (!token?.trim()) return null;
  const sub = jwtSubject(token.trim());
  return sub ? sub.slice(0, 8) : null;
}

function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    let decoded: string;
    if (typeof atob !== "undefined") decoded = atob(base64);
    else if (typeof Buffer !== "undefined") decoded = Buffer.from(base64, "base64").toString("utf8");
    else return null;
    const payload = JSON.parse(decoded) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Opaque Better Auth tokens are always "usable"; JWTs check exp. */
export function isSessionTokenUsable(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  if (!t) return false;
  if (!looksLikeJwt(t)) return true;
  const expMs = decodeJwtExpMs(t);
  if (!expMs) return true;
  return Date.now() < expMs - 30_000;
}

function agentDebugLog(_message: string, _data: Record<string, unknown>) {
  // Intentionally no-op — debug instrumentation removed from production paths.
}

export { agentDebugLog, jwtSubPrefix };

function pickTokenFromUnknown(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const direct =
    (typeof rec.token === "string" ? rec.token : null) ??
    (typeof rec.accessToken === "string" ? rec.accessToken : null) ??
    (typeof rec.access_token === "string" ? rec.access_token : null) ??
    (typeof rec.sessionToken === "string" ? rec.sessionToken : null) ??
    (typeof rec.bearerToken === "string" ? rec.bearerToken : null);
  if (direct?.trim()) return direct.trim();
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

function deepFindToken(data: unknown, depth = 0): string | null {
  if (!data || depth > 5) return null;
  if (typeof data === "string") {
    const t = data.trim();
    if (!t) return null;
    // Prefer JWTs when deep-scanning strings; opaque tokens come from known keys.
    return looksLikeJwt(t) ? t : null;
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

export function setAccessToken(token: string | null | undefined) {
  const normalized = token?.trim() ? token.trim() : null;
  inMemoryAccessToken = normalized;
  if (normalized) {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, normalized).catch(() => {});
  } else {
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
  }
}

/** Drop cached Better Auth client so sign-out / re-login does not reuse stale session. */
export function resetAuthClient() {
  authClientInstance = null;
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
  refreshInFlight = null;
  resetAuthClient();
  AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
}

export function setAccessTokenFromAuthData(data: unknown): string | null {
  const token = pickTokenFromUnknown(data) ?? deepFindToken(data);
  if (token) setAccessToken(token);
  return token;
}

function syncTokenForClient(): string {
  return inMemoryAccessToken?.trim() ?? "";
}

function createMobileAuthClient() {
  return createAuthClient({
    baseURL: getBackendUrl(),
    plugins: [emailOTPClient()],
    fetchOptions: {
      credentials: "omit",
      customFetchImpl: expoFetch as unknown as typeof fetch,
      auth: {
        type: "Bearer",
        token: () => syncTokenForClient(),
      },
      onSuccess: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token");
        if (authToken?.trim()) setAccessToken(authToken.trim());
      },
    },
  });
}

type MobileAuthClient = ReturnType<typeof createMobileAuthClient>;

let authClientInstance: MobileAuthClient | null = null;

function getAuthClientInstance(): MobileAuthClient {
  authClientInstance ??= createMobileAuthClient();
  return authClientInstance;
}

/** Lazy Better Auth client pointed at Alenio backend `/api/auth`. */
export const authClient: MobileAuthClient = new Proxy({} as MobileAuthClient, {
  get(_target, prop, receiver) {
    const client = getAuthClientInstance();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

/** Password-reset + OTP — same shape web uses so screens stay stable. */
export type AuthPasswordFlowClient = {
  forgetPassword: {
    emailOtp: (input: { email: string }) => Promise<{ error?: { message?: string } | null }>;
  };
  emailOtp: {
    checkVerificationOtp: (input: {
      email: string;
      otp: string;
      type: "forget-password";
    }) => Promise<{ error?: { message?: string } | null }>;
    resetPassword: (input: {
      email: string;
      otp: string;
      password: string;
    }) => Promise<{ error?: { message?: string } | null }>;
  };
  resetPassword: (input: { newPassword: string; token: string }) => Promise<{ error?: { message?: string } | null }>;
};

export function getAuthPasswordFlowClient(): AuthPasswordFlowClient {
  const client = getAuthClientInstance();
  return {
    forgetPassword: {
      emailOtp: async ({ email }) => {
        const result = await client.emailOtp.sendVerificationOtp({
          email,
          type: "forget-password",
        });
        return { error: result.error ? { message: result.error.message ?? "Could not send code." } : null };
      },
    },
    emailOtp: {
      checkVerificationOtp: async ({ email, otp, type }) => {
        const result = await client.emailOtp.checkVerificationOtp({ email, otp, type });
        return { error: result.error ? { message: result.error.message ?? "Invalid code." } : null };
      },
      resetPassword: async ({ email, otp, password }) => {
        const result = await client.emailOtp.resetPassword({ email, otp, password });
        return { error: result.error ? { message: result.error.message ?? "Could not reset password." } : null };
      },
    },
    resetPassword: async ({ newPassword, token }) => {
      const result = await client.resetPassword({ newPassword, token });
      return { error: result.error ? { message: result.error.message ?? "Could not reset password." } : null };
    },
  };
}

/**
 * Ask Better Auth for an updated session using the current bearer.
 * Call after a 401 or when a JWT is near expiry.
 */
export async function refreshSessionTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const run = async (): Promise<boolean> => {
    try {
      let bearer = inMemoryAccessToken?.trim() ?? null;
      if (!bearer) {
        try {
          bearer = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY))?.trim() ?? null;
          if (bearer) inMemoryAccessToken = bearer;
        } catch {
          bearer = null;
        }
      }
      if (!bearer) return false;

      const forced = await getAuthClientInstance().getSession({
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        },
      });

      const next =
        setAccessTokenFromAuthData(forced?.data ?? null) ?? setAccessTokenFromAuthData(forced ?? null);
      return !!next || isSessionTokenUsable(bearer);
    } catch {
      return false;
    }
  };

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** When returning to the app, refresh if a JWT expires soon (opaque tokens skip). */
const FOREGROUND_REFRESH_WITHIN_MS = 12 * 60 * 1000;

export async function ensureSessionFreshOnForeground(): Promise<void> {
  try {
    let token = inMemoryAccessToken?.trim() ?? null;
    if (!token) token = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY))?.trim() ?? null;
    if (!token) return;
    if (!looksLikeJwt(token)) return;
    const expMs = decodeJwtExpMs(token);
    if (!expMs) return;
    if (expMs - Date.now() > FOREGROUND_REFRESH_WITHIN_MS) return;
    await refreshSessionTokens();
  } catch {
    /* ignore */
  }
}

/**
 * Obtain a bearer token the Alenio API accepts (Better Auth opaque session token).
 */
export async function resolveBackendBearerToken(options?: {
  fresh?: boolean;
  expectedUserId?: string;
}): Promise<string | null> {
  const fresh = options?.fresh === true;
  const expectedUserId = options?.expectedUserId?.trim() || undefined;

  const accept = (token: string | null | undefined): string | null => {
    const normalized = token?.trim() ?? "";
    if (!normalized || !isSessionTokenUsable(normalized)) return null;
    if (expectedUserId && looksLikeJwt(normalized)) {
      const sub = jwtSubject(normalized);
      if (sub && sub !== expectedUserId) return null;
    }
    return normalized;
  };

  if (!fresh) {
    const cached = accept(inMemoryAccessToken);
    if (cached) return cached;
  }

  await refreshSessionTokens();
  const afterRefresh = accept(inMemoryAccessToken) ?? accept(await getAccessToken());
  if (afterRefresh) return afterRefresh;

  try {
    const bearer = inMemoryAccessToken?.trim() ?? null;
    const forced = await getAuthClientInstance().getSession({
      fetchOptions: {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    });
    const fromSession =
      accept(setAccessTokenFromAuthData(forced?.data ?? null)) ??
      accept(setAccessTokenFromAuthData(forced ?? null));
    if (fromSession) return fromSession;
  } catch {
    /* ignore */
  }

  return accept(await getAccessToken());
}

export async function getAccessToken(): Promise<string | null> {
  if (inMemoryAccessToken?.trim()) {
    const mem = inMemoryAccessToken.trim();
    if (isSessionTokenUsable(mem)) {
      if (looksLikeJwt(mem)) {
        const expMs = decodeJwtExpMs(mem);
        if (expMs && expMs - 5 * 60 * 1000 <= Date.now()) {
          await refreshSessionTokens();
          if (inMemoryAccessToken?.trim() && isSessionTokenUsable(inMemoryAccessToken)) {
            return inMemoryAccessToken.trim();
          }
        }
      }
      return mem;
    }
  }

  try {
    const stored = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (stored?.trim()) {
      inMemoryAccessToken = stored.trim();
      if (isSessionTokenUsable(inMemoryAccessToken)) return inMemoryAccessToken;
    }
  } catch {
    /* ignore */
  }

  try {
    const bearer = inMemoryAccessToken?.trim() ?? null;
    const result = await getAuthClientInstance().getSession({
      fetchOptions: {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    });
    const token =
      setAccessTokenFromAuthData(result?.data ?? null) ?? setAccessTokenFromAuthData(result ?? null);
    if (token && isSessionTokenUsable(token)) return token;
  } catch {
    /* ignore */
  }

  return inMemoryAccessToken?.trim() && isSessionTokenUsable(inMemoryAccessToken)
    ? inMemoryAccessToken.trim()
    : null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return authHeadersFromToken(token);
}

export function authHeadersFromToken(bearerToken?: string | null): Record<string, string> {
  const token = bearerToken?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Warm in-memory token from storage (non-blocking).
AsyncStorage.getItem(ACCESS_TOKEN_KEY)
  .then((stored) => {
    if (stored?.trim() && !inMemoryAccessToken) {
      inMemoryAccessToken = stored.trim();
    }
  })
  .catch(() => {});
