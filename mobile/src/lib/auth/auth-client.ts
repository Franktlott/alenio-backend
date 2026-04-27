import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import * as Linking from "expo-linking";

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
  return (expoFetch as typeof fetch)(input, { ...init, headers });
}

/** Neon Auth + Expo fetch; sets Origin so CSRF / callback checks succeed on native. */
export const authClient = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthVanillaAdapter({
    fetchOptions: {
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

function pickSessionToken(data: SessionShape | null): string | null {
  const session = data?.session;
  return session?.accessToken ?? session?.access_token ?? session?.token ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  const result = await authClient.getSession();
  const data = (result?.data ?? null) as SessionShape | null;
  let token = pickSessionToken(data);
  if (token) return token;

  // Fallback: bypass potential stale client cache and force a network read once.
  try {
    const forced = await authClient.getSession({
      fetchOptions: {
        headers: { "X-Force-Fetch": "1" },
      },
    } as never);
    token = pickSessionToken((forced?.data ?? null) as SessionShape | null);
  } catch {
    // ignore and return null below
  }

  return token;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
