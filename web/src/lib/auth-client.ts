import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import { extractTokenFromAuthPayload, getStoredToken, setStoredToken } from "./token";

function readNeonAuthUrl(): string {
  return import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? "";
}

function neonAuthOrigin(): string {
  const raw = readNeonAuthUrl();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

let authClientInstance: ReturnType<typeof createAuthClient> | null = null;

function getAuthClientInstance(): ReturnType<typeof createAuthClient> {
  const url = readNeonAuthUrl();
  if (!url) {
    throw new Error(
      "Missing VITE_NEON_AUTH_URL. Create web/.env from .env.example, set VITE_NEON_AUTH_URL and VITE_BACKEND_URL, then restart the dev server (bun run dev).",
    );
  }
  const origin = neonAuthOrigin();
  authClientInstance ??= createAuthClient(url, {
    adapter: BetterAuthVanillaAdapter({
      fetchOptions: {
        headers: origin
          ? {
              Origin: origin,
              Referer: `${origin}/`,
            }
          : undefined,
      },
    }),
  });
  return authClientInstance;
}

/** Same adapter as the mobile app — avoids broken nested APIs (e.g. `signIn.email`) from a Proxy or wrong client shape. */
export function getAuthClient(): ReturnType<typeof createAuthClient> {
  return getAuthClientInstance();
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
  const base = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (!base) return;
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
