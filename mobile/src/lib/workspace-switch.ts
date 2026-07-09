import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import type { Team, Task, CalendarEvent } from "@/lib/types";
import { hasTeamPlan } from "@/lib/plan-access-copy";
import { useSubscriptionStore } from "@/lib/state/subscription-store";

function removeTeamScopedQueries(queryClient: QueryClient, teamId: string) {
  queryClient.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(teamId),
  });
}

async function fetchFreshTeams(queryClient: QueryClient): Promise<Team[]> {
  await queryClient.invalidateQueries({ queryKey: ["teams"] });
  return queryClient.fetchQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 0,
  });
}

/** After leaving or deleting a workspace, clear caches and pick a valid active workspace. */
export async function applyTeamRemovedFromAccount(
  removedTeamId: string,
  activeTeamId: string | null,
  setActiveTeamId: (id: string | null) => void,
  queryClient: QueryClient,
): Promise<Team[]> {
  removeTeamScopedQueries(queryClient, removedTeamId);

  const freshTeams = await fetchFreshTeams(queryClient);

  if (activeTeamId === removedTeamId) {
    if (freshTeams.length > 0) {
      await performWorkspaceSwitch(freshTeams[0].id, removedTeamId, setActiveTeamId, queryClient);
    } else {
      setActiveTeamId(null);
      useSubscriptionStore.getState().setPlan("free");
      router.replace("/onboarding");
    }
  }

  return freshTeams;
}

/** If the active workspace no longer exists, switch to another or clear selection. */
export async function reconcileActiveTeamAfterRemoval(
  activeTeamId: string | null,
  setActiveTeamId: (id: string | null) => void,
  queryClient: QueryClient,
): Promise<void> {
  if (!activeTeamId) return;

  const freshTeams = await fetchFreshTeams(queryClient);
  if (freshTeams.some((team) => team.id === activeTeamId)) return;

  removeTeamScopedQueries(queryClient, activeTeamId);

  if (freshTeams.length > 0) {
    await performWorkspaceSwitch(freshTeams[0].id, activeTeamId, setActiveTeamId, queryClient);
    return;
  }

  setActiveTeamId(null);
  useSubscriptionStore.getState().setPlan("free");
}

export type SwitchWorkspaceOptions = {
  /** Route to open after the overlay dismisses (e.g. `/(app)/team`). */
  navigateTo?: string;
};

export async function performWorkspaceSwitch(
  teamId: string,
  activeTeamId: string | null,
  setActiveTeamId: (id: string | null) => void,
  queryClient: QueryClient,
): Promise<boolean> {
  if (!teamId || teamId === activeTeamId) return false;

  setActiveTeamId(teamId);

  await queryClient.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key)) return false;
      if (key[0] === "teams") return true;
      return key.includes(teamId);
    },
  });

  const [, , subscription] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ["teams"],
      queryFn: () => api.get<Team[]>("/api/teams"),
    }),
    queryClient.fetchQuery({
      queryKey: ["team", teamId],
      queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    }),
    queryClient.fetchQuery({
      queryKey: ["subscription", teamId],
      queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${teamId}/subscription`),
    }),
  ]);

  const normalizedPlan = subscription.plan === "pro" ? "team" : subscription.plan;
  useSubscriptionStore.getState().setPlan(normalizedPlan === "team" ? "team" : "free");

  if (hasTeamPlan(subscription)) {
    await Promise.all([
      queryClient.fetchQuery({
        queryKey: ["tasks", teamId, "mine", "active"],
        queryFn: () =>
          api.get<{ tasks: Task[]; nextCursor: string | null }>(
            `/api/teams/${teamId}/tasks?myTasks=true&activeOnly=true&limit=200`,
          ),
      }),
      queryClient.fetchQuery({
        queryKey: ["calendar-events", teamId],
        queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${teamId}/events`),
      }),
    ]);
  } else {
    queryClient.removeQueries({ queryKey: ["tasks", teamId] });
    queryClient.removeQueries({ queryKey: ["calendar-events", teamId] });
  }

  return true;
}
