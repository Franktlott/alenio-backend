import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { getWebApiBase } from "./api-base";
import { getResolvedBackendUrl } from "./env-config";
import {
  extractTokenFromAuthPayload,
  getStoredToken,
  isSessionTokenUsable,
  setStoredToken,
} from "./token";

/** Better Auth is served from the Alenio API (`/api/auth/*`). */
function readAuthBaseUrl(): string {
  const backend = getResolvedBackendUrl();
  if (!backend) {
    throw new Error(
      "Missing backend URL. Copy web/.env.example to web/.env, set VITE_DEV_BACKEND_URL / VITE_PROD_BACKEND_URL, then restart the dev server.",
    );
  }
  return backend;
}

let authClientInstance: ReturnType<typeof createAuthClient> | null = null;

/** Drop cached client so sign-out / re-login does not reuse stale in-memory session. */
export function resetAuthClient(): void {
  authClientInstance = null;
}

function getAuthClientInstance(): ReturnType<typeof createAuthClient> {
  const baseURL = readAuthBaseUrl();
  authClientInstance ??= createAuthClient({
    baseURL,
    plugins: [emailOTPClient()],
    fetchOptions: {
      credentials: "omit",
      auth: {
        type: "Bearer",
        token: () => getStoredToken() || "",
      },
      onSuccess: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token");
        if (authToken?.trim()) setStoredToken(authToken.trim());
      },
    },
  });
  return authClientInstance;
}

export function getAuthClient(): ReturnType<typeof createAuthClient> {
  return getAuthClientInstance();
}

/** Password-reset + OTP — same shape the web screens already call. */
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
  const client = getAuthClient();
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

function storedAccessReady(): boolean {
  return isSessionTokenUsable(getStoredToken());
}

/**
 * Refreshes session from Better Auth and persists any rotated access token.
 */
export async function ensureWebSessionAndToken(maxAttempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bearer = getStoredToken()?.trim() ?? null;
    const sessionRes = await getAuthClient().getSession({
      fetchOptions: {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    });
    setAccessTokenFromAuthData(sessionRes ?? null);
    setAccessTokenFromAuthData((sessionRes as { data?: unknown })?.data ?? null);

    const data = (sessionRes as { data?: unknown })?.data ?? sessionRes;
    const userPresent = authPayloadHasUser(data);
    if (storedAccessReady() && userPresent) return true;
    if (storedAccessReady() && attempt >= 1) return true;

    await new Promise((r) => setTimeout(r, 120 + attempt * 80));
  }
  return storedAccessReady();
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
