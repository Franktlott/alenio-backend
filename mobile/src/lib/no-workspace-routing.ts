import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useTeamStore } from "@/lib/state/team-store";
import { finishMobilePostAuth } from "@/lib/auth/finish-post-auth";
import {
  clearPendingJoinCode,
  getPendingJoinCode,
  hydratePendingJoinCode,
} from "@/lib/auth/pending-join-code";

export const NO_WORKSPACE_WELCOME_PATH = "/no-workspace-welcome";

export async function fetchUserTeams(queryClient?: QueryClient): Promise<Team[]> {
  if (queryClient) {
    const cached = queryClient.getQueryData<Team[]>(["teams"]);
    if (cached) return cached;
    return queryClient.fetchQuery({
      queryKey: ["teams"],
      queryFn: () => api.get<Team[]>("/api/teams"),
      staleTime: 0,
    });
  }
  return api.get<Team[]>("/api/teams");
}

export function resolveActiveTeamId(teams: Team[], storedTeamId: string | null): string | null {
  if (teams.length === 0) return null;
  if (storedTeamId && teams.some((team) => team.id === storedTeamId)) {
    return storedTeamId;
  }
  return teams[0]!.id;
}

export async function resolveAuthenticatedDestination(
  _isAdmin: boolean,
  queryClient?: QueryClient,
): Promise<string> {
  // Platform admins stay in the regular app and open Admin from Profile.

  if (queryClient) {
    await finishMobilePostAuth(queryClient);
  } else {
    await hydratePendingJoinCode();
  }

  const joinCode = getPendingJoinCode();
  if (joinCode) {
    clearPendingJoinCode();
    return `/onboarding?mode=join&code=${encodeURIComponent(joinCode)}&focus=code`;
  }

  const teams = await fetchUserTeams(queryClient);
  if (teams.length === 0) return NO_WORKSPACE_WELCOME_PATH;

  const storedTeamId = useTeamStore.getState().activeTeamId;
  const nextTeamId = resolveActiveTeamId(teams, storedTeamId);
  if (nextTeamId && nextTeamId !== storedTeamId) {
    useTeamStore.getState().setActiveTeamId(nextTeamId);
  }

  return "/(app)/chat";
}

export function navigateToAuthenticatedHome(isAdmin: boolean, queryClient?: QueryClient) {
  let cancelled = false;

  const attempt = async () => {
    if (cancelled) return;
    try {
      const destination = await resolveAuthenticatedDestination(isAdmin, queryClient);
      router.replace(destination);
    } catch {
      // expo-router can throw if the target stack is not mounted yet
    }
  };

  void attempt();
  const timer = setTimeout(() => void attempt(), 300);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
