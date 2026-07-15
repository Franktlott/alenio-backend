import type { QueryClient } from "@tanstack/react-query";
import { getAccessToken, setAccessTokenFromAuthData } from "@/lib/auth/auth-client";
import { provisionBackendUserAfterAuth } from "@/lib/auth/sync-backend-user";
import { fetchMeUser, type MeUser } from "@/lib/auth/me-query";
import { primeMobileAuthSession } from "@/lib/auth/finish-post-auth";
import { navigateToMobileHomeWithRetry } from "@/lib/auth/auth-entry";
import { clearSignedOutMark } from "@/lib/auth/use-session";
import { getBackendUrl } from "@/lib/backend-url";
import { mobileAuthHeaders } from "@/lib/auth/auth-api";
import { safeFetch } from "@/lib/auth/safe-fetch";

type SessionData = { user: unknown };

async function fetchSessionViaSafeFetch(token: string): Promise<SessionData | null> {
  try {
    const res = await safeFetch(`${getBackendUrl()}/api/auth/get-session`, {
      method: "GET",
      headers: mobileAuthHeaders({
        Authorization: `Bearer ${token}`,
      }),
      credentials: "omit",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SessionData | null;
    return body?.user ? body : null;
  } catch (err) {
    console.warn("[alenio-auth] get-session failed", err);
    return null;
  }
}

/**
 * After Better Auth sign-in/sign-up returns a session payload, materialize a backend-ready bearer + session.
 * Avoids better-auth client (Expo fetch / better-fetch crashes).
 */
export async function resolveSessionAfterAuth(
  result: { data?: { user?: unknown } | null } | null | undefined,
): Promise<{ sessionData: SessionData; token: string } | null> {
  setAccessTokenFromAuthData(result ?? null);
  setAccessTokenFromAuthData(result?.data ?? null);
  const token =
    setAccessTokenFromAuthData(result?.data ?? null) ??
    setAccessTokenFromAuthData(result ?? null) ??
    (await getAccessToken());
  if (!token) return null;

  const fromSignIn = result?.data?.user ? ({ user: result.data.user } as SessionData) : null;
  const sessionData = fromSignIn ?? (await fetchSessionViaSafeFetch(token));
  if (!sessionData?.user) return null;
  return { sessionData, token };
}

/** Sync Prisma user, load /api/me with retries, then prime auth-ready. */
export async function loadAndPrimeMobileAuth(
  queryClient: QueryClient,
  sessionData: SessionData,
  token: string,
): Promise<MeUser | null> {
  await provisionBackendUserAfterAuth(token);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const me = await fetchMeUser(token);
    if (me?.id) {
      clearSignedOutMark();
      await primeMobileAuthSession(queryClient, sessionData, me);
      return me;
    }
    if (attempt < 4) {
      await provisionBackendUserAfterAuth(token);
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return null;
}

/** Full post-auth entry: resolve session → prime → optionally navigate home. */
export async function completeMobileAuthEntry(
  queryClient: QueryClient,
  result: { data?: { user?: unknown } | null } | null | undefined,
  options?: { navigate?: boolean },
): Promise<{ ok: true; me: MeUser } | { ok: false; error: string }> {
  const shouldNavigate = options?.navigate !== false;
  const resolved = await resolveSessionAfterAuth(result);
  if (!resolved) {
    return { ok: false, error: "Sign-in did not establish a session. Please try again." };
  }
  const me = await loadAndPrimeMobileAuth(queryClient, resolved.sessionData, resolved.token);
  if (!me?.id) {
    return { ok: false, error: "Could not load your profile. Try signing in again." };
  }
  if (shouldNavigate) {
    navigateToMobileHomeWithRetry(me.isAdmin === true, queryClient);
  }
  return { ok: true, me };
}
