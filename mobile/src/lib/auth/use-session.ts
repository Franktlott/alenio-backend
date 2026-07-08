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
          "X-Force-Fetch": "1",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      },
    } as never);
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

/** Cold start only — sign-in/logout set `AUTH_READY_QUERY_KEY` directly. */
export async function bootstrapMobileAuth(): Promise<MobileAuthReady | null> {
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
  const authReady: MobileAuthReady = { session: sessionData, me };
  queryClient.setQueryData(AUTH_READY_QUERY_KEY, authReady, { updatedAt: Date.now() });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  queryClient.setQueryData(SESSION_QUERY_KEY, sessionData);
  agentDebugLog("auth-ready primed", {
    runId: "auth-simplify-v4",
    hypothesisId: "H15",
    userIdPrefix: me.id.slice(0, 8),
  });
  return authReady;
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

export const useSession = () => {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchAuthSession,
    staleTime: 1000 * 60,
  });
};

export const useInvalidateSession = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
};
