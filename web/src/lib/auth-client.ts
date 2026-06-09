import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import { getWebApiBase } from "./api-base";
import { getResolvedNeonAuthUrl } from "./env-config";
import {
  extractTokenFromAuthPayload,
  getStoredToken,
  isJwtExpiredSkew,
  looksLikeJwt,
  setStoredToken,
} from "./token";

function readNeonAuthUrl(): string {
  return getResolvedNeonAuthUrl();
}

let authClientInstance: ReturnType<typeof createAuthClient> | null = null;

/** Token-based session — omit cookies so cross-origin Neon Auth requests skip cookie CSRF origin checks. */
function webAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: "omit" });
}

/** Drop cached Neon client so sign-out / re-login does not reuse stale in-memory session. */
export function resetAuthClient(): void {
  authClientInstance = null;
}

function getAuthClientInstance(): ReturnType<typeof createAuthClient> {
  const url = readNeonAuthUrl();
  if (!url) {
    throw new Error(
      "Missing Neon Auth URL. Copy web/.env.example to web/.env, set VITE_DEV_NEON_AUTH_URL / VITE_PROD_NEON_AUTH_URL (and matching backend URLs), then restart the dev server.",
    );
  }
  authClientInstance ??= createAuthClient(url, {
    adapter: BetterAuthVanillaAdapter({
      fetchOptions: {
        customFetchImpl: webAuthFetch,
      },
    }),
  });
  return authClientInstance;
}

/** Same adapter as the mobile app — avoids broken nested APIs (e.g. `signIn.email`) from a Proxy or wrong client shape. */
export function getAuthClient(): ReturnType<typeof createAuthClient> {
  return getAuthClientInstance();
}

/** Password-reset + OTP; `@neondatabase/auth` typings omit these on the client union. */
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
  return getAuthClient() as unknown as AuthPasswordFlowClient;
}

export function setAccessTokenFromAuthData(data: unknown): string | null {
  const token = extractTokenFromAuthPayload(data);
  if (token) setStoredToken(token);
  return token;
}

export function getAccessToken(): string | null {
  return getStoredToken();
}

export function clearAccessToken(): void {
  setStoredToken(null);
  resetAuthClient();
}

function authPayloadHasUser(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object";
  if (isObj(o.user)) return true;
  if (isObj(o.session)) {
    const s = o.session;
    if (isObj(s.user)) return true;
  }
  if (isObj(o.data)) return authPayloadHasUser(o.data);
  return false;
}

function storedAccessJwtReady(): boolean {
  const token = getStoredToken()?.trim() ?? null;
  return !!(token && looksLikeJwt(token) && !isJwtExpiredSkew(token));
}

/**
 * Refreshes session from Neon Auth and persists any rotated access token.
 * Succeeds when a non-expired JWT is stored — `getSession` sometimes omits `data.user` while the bearer is valid.
 */
export async function ensureWebSessionAndToken(maxAttempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bearer = getStoredToken()?.trim() ?? null;
    const sessionRes = await getAuthClient().getSession({
      fetchOptions: {
        headers: {
          "X-Force-Fetch": "1",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    } as never);
    setAccessTokenFromAuthData(sessionRes ?? null);
    setAccessTokenFromAuthData((sessionRes as { data?: unknown })?.data ?? null);

    const data = (sessionRes as { data?: unknown })?.data ?? sessionRes;
    const userPresent = authPayloadHasUser(data);
    if (storedAccessJwtReady() && userPresent) return true;
    if (storedAccessJwtReady() && attempt >= 1) return true;

    await new Promise((r) => setTimeout(r, 120 + attempt * 80));
  }
  return storedAccessJwtReady();
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshSessionTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const run = async (): Promise<boolean> => {
    const bearer = getStoredToken()?.trim() ?? null;
    if (!bearer) return false;
    try {
      const forced = await getAuthClient().getSession({
        fetchOptions: {
          headers: {
            "X-Force-Fetch": "1",
            Authorization: `Bearer ${bearer}`,
          },
        },
      } as never);
      const next =
        setAccessTokenFromAuthData(forced?.data ?? null) ?? setAccessTokenFromAuthData(forced ?? null);
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

export async function syncBackendUser(): Promise<void> {
  const base = getWebApiBase();
  const token = getStoredToken();
  if (!token) return;
  try {
    const res = await fetch(`${base}/api/auth/sync-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.warn("[enterprise-web] sync-user failed", res.status);
    }
  } catch (e) {
    console.warn("[enterprise-web] sync-user", e);
  }
}
