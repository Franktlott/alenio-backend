import type { QueryClient } from "@tanstack/react-query";
import {
  authClient,
  getAccessToken,
  resolveBackendBearerToken,
  setAccessTokenFromAuthData,
} from "@/lib/auth/auth-client";
import { provisionBackendUserAfterAuth } from "@/lib/auth/sync-backend-user";
import { fetchMeUser, type MeUser } from "@/lib/auth/me-query";
import { primeMobileAuthSession } from "@/lib/auth/finish-post-auth";
import { navigateToMobileHomeWithRetry } from "@/lib/auth/auth-entry";
import { clearSignedOutMark } from "@/lib/auth/use-session";

type SessionData = { user: unknown };

/**
 * After Better Auth sign-in/sign-up returns a session payload, materialize a backend-ready bearer + session.
 */
export async function resolveSessionAfterAuth(
  result: { data?: { user?: unknown } | null } | null | undefined,
): Promise<{ sessionData: SessionData; token: string } | null> {
  setAccessTokenFromAuthData(result ?? null);
  setAccessTokenFromAuthData(result?.data ?? null);
  let token =
    setAccessTokenFromAuthData(result?.data ?? null) ??
    setAccessTokenFromAuthData(result ?? null) ??
    (await getAccessToken());

  const sessionRes = await authClient.getSession({
    fetchOptions: {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  });
  token =
    setAccessTokenFromAuthData(sessionRes ?? null) ??
    setAccessTokenFromAuthData(sessionRes.data ?? null) ??
    token;

  const sessionData = (sessionRes.data ?? null) as SessionData | null;
  const sessionUserId = (sessionData?.user as { id?: string } | undefined)?.id;
  const backendToken = await resolveBackendBearerToken({
    fresh: true,
    expectedUserId: sessionUserId,
  });
  if (!sessionData?.user || !backendToken) return null;
  return { sessionData, token: backendToken };
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

/** Full post-auth entry: resolve session → prime → navigate home (includes invite redeem). */
export async function completeMobileAuthEntry(
  queryClient: QueryClient,
  result: { data?: { user?: unknown } | null } | null | undefined,
): Promise<{ ok: true; me: MeUser } | { ok: false; error: string }> {
  const resolved = await resolveSessionAfterAuth(result);
  if (!resolved) {
    return { ok: false, error: "Sign-in did not establish a session. Please try again." };
  }
  const me = await loadAndPrimeMobileAuth(queryClient, resolved.sessionData, resolved.token);
  if (!me?.id) {
    return { ok: false, error: "Could not load your profile. Try signing in again." };
  }
  navigateToMobileHomeWithRetry(me.isAdmin === true, queryClient);
  return { ok: true, me };
}
