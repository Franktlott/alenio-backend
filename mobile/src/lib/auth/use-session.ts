import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { agentDebugLog, authClient, getAccessToken } from "./auth-client";
import { fetchMeUser, ME_QUERY_KEY, type MeUser } from "./me-query";

export const SESSION_QUERY_KEY = ["auth-session"] as const;
/** Single atomic auth gate — session + profile updated together (avoids split-cache races). */
export const AUTH_READY_QUERY_KEY = ["auth-ready"] as const;

export type MobileAuthReady = {
  session: { user: unknown };
  me: MeUser;
};

function sessionWithMe(session: { user: unknown }, me: MeUser): { user: unknown } {
  const currentUser =
    session.user && typeof session.user === "object"
      ? (session.user as Record<string, unknown>)
      : {};
  return {
    ...session,
    user: { ...currentUser, ...me },
  };
}

let forceSignedOutUntil = 0;

export function markSessionSignedOut(ms = 30_000) {
  forceSignedOutUntil = Date.now() + ms;
}

export function clearSignedOutMark() {
  forceSignedOutUntil = 0;
}

export async function fetchAuthSession() {
  if (Date.now() < forceSignedOutUntil) {
    agentDebugLog("fetchAuthSession blocked signed-out", {
      runId: "auth-simplify-v1",
      hypothesisId: "H15",
    });
    return null;
  }
  try {
    const bearer = (await getAccessToken())?.trim() ?? null;
    const result = await authClient.getSession({
      fetchOptions: {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    });
    if (Date.now() < forceSignedOutUntil) {
      agentDebugLog("fetchAuthSession discard stale in-flight", {
        runId: "auth-simplify-v1",
        hypothesisId: "H15",
      });
      return null;
    }
    const data = result.data ?? null;
    agentDebugLog("fetchAuthSession result", {
      runId: "auth-simplify-v1",
      hypothesisId: "H15",
      hasUser: !!(data as { user?: unknown } | null)?.user,
    });
    return data;
  } catch {
    return null;
  }
}

/** Stop in-flight session/me fetches from overwriting a fresh sign-in. Never cancel auth-ready. */
export async function cancelMobileAuthQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY });
  await queryClient.cancelQueries({ queryKey: ME_QUERY_KEY });
}

export async function clearMobileAuthCaches(queryClient: QueryClient) {
  await cancelMobileAuthQueries(queryClient);
  queryClient.setQueryData(AUTH_READY_QUERY_KEY, null, { updatedAt: Date.now() });
  queryClient.setQueryData(SESSION_QUERY_KEY, null);
  queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
}

/**
 * Clear user-specific app data without deleting the signed-out auth marker.
 * The root auth bootstrap runs only once per app process, so auth-ready must
 * be restored after QueryClient.clear() or the index gate can wait forever.
 */
export function clearAllCachesForSignedOutUser(queryClient: QueryClient) {
  queryClient.clear();
  const updatedAt = Date.now();
  queryClient.setQueryData(AUTH_READY_QUERY_KEY, null, { updatedAt });
  queryClient.setQueryData(SESSION_QUERY_KEY, null, { updatedAt });
}

/** Cold start only — sign-in/logout set `AUTH_READY_QUERY_KEY` directly. */
export async function bootstrapMobileAuth(): Promise<MobileAuthReady | null> {
  const [{ hydratePendingTeamInviteToken }, { hydratePendingJoinCode }] = await Promise.all([
    import("@/lib/auth/pending-team-invite"),
    import("@/lib/auth/pending-join-code"),
  ]);
  await Promise.all([hydratePendingTeamInviteToken(), hydratePendingJoinCode()]);

  const session = await fetchAuthSession();
  if (!(session as { user?: unknown } | null)?.user) return null;
  const me = await fetchMeUser();
  if (!me?.id) return null;
  return { session: session as { user: unknown }, me };
}

export async function primeMobileAuthReady(
  queryClient: QueryClient,
  sessionData: { user: unknown },
  me: MeUser
) {
  await cancelMobileAuthQueries(queryClient);
  const syncedSession = sessionWithMe(sessionData, me);
  const authReady: MobileAuthReady = { session: syncedSession, me };
  queryClient.setQueryData(AUTH_READY_QUERY_KEY, authReady, { updatedAt: Date.now() });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  queryClient.setQueryData(SESSION_QUERY_KEY, syncedSession);
  agentDebugLog("auth-ready primed", {
    runId: "auth-simplify-v4",
    hypothesisId: "H15",
    userIdPrefix: me.id.slice(0, 8),
  });
  return authReady;
}

/** Refetch `/api/me` and keep auth-ready + me caches aligned (e.g. after isAdmin changes). */
export async function refreshMeInAuthCaches(queryClient: QueryClient): Promise<MeUser | null> {
  const me = await fetchMeUser();
  if (!me?.id) return null;
  queryClient.setQueryData(ME_QUERY_KEY, me);
  const cachedSession = queryClient.getQueryData<{ user: unknown } | null>(SESSION_QUERY_KEY);
  const syncedSession =
    cachedSession?.user ? sessionWithMe(cachedSession, me) : cachedSession;
  if (syncedSession) {
    queryClient.setQueryData(SESSION_QUERY_KEY, syncedSession);
  }
  const ready = queryClient.getQueryData<MobileAuthReady | null>(AUTH_READY_QUERY_KEY);
  if (ready?.me?.id === me.id) {
    const readySession = sessionWithMe(ready.session, me);
    queryClient.setQueryData(
      AUTH_READY_QUERY_KEY,
      { ...ready, session: readySession, me },
      { updatedAt: Date.now() }
    );
    if (!syncedSession) {
      queryClient.setQueryData(SESSION_QUERY_KEY, readySession);
    }
  }
  return me;
}

/** Subscribe to auth-ready cache; bootstrap runs once from root layout (never auto-refetch). */
export function useMobileAuthReady() {
  return useQuery<MobileAuthReady | null>({
    queryKey: AUTH_READY_QUERY_KEY,
    queryFn: bootstrapMobileAuth,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * The auth session has no photo URL, `isAdmin`, or `isWorkplaceConnected` —
 * those only exist on `/api/me`, which is why the cache is primed with the two
 * merged together. Refetching had been dropping back to the bare session and
 * stripping them, which is what made the header avatar fall back to initials
 * until something re-merged (opening the profile, which does it on focus).
 *
 * The cached profile is reused when there is one, so a session refetch does
 * not pull the photo down again; it is only refetched when the profile itself
 * has been cleared or updated.
 */
async function fetchSessionWithProfile(queryClient: QueryClient) {
  const session = await fetchAuthSession();
  if (!(session as { user?: unknown } | null)?.user) return session;
  const cachedMe = queryClient.getQueryData<MeUser | null>(ME_QUERY_KEY);
  const me = cachedMe?.id ? cachedMe : await fetchMeUser();
  if (!me?.id) return session;
  if (!cachedMe?.id) queryClient.setQueryData(ME_QUERY_KEY, me);
  return sessionWithMe(session as { user: unknown }, me) as typeof session;
}

export const useSession = () => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => fetchSessionWithProfile(queryClient),
    staleTime: 1000 * 60,
  });
};

export const useInvalidateSession = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
};
