import type { Query, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import type { Team, Task, CalendarEvent } from "@/lib/types";
import { hasTeamPlan } from "@/lib/plan-access-copy";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useWorkspaceSwitchStore } from "@/lib/state/workspace-switch-store";

export const WORKSPACE_OVERLAY_MIN_MS = 4000;

export function isWorkspaceSwitchFetch(query: Query, teamId: string): boolean {
  if (query.state.fetchStatus !== "fetching") return false;
  const key = query.queryKey;
  if (!Array.isArray(key)) return false;
  if (key[0] === "teams") return true;
  return key.includes(teamId);
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

  const teams = queryClient.getQueryData<Team[]>(["teams"]);
  const teamName = teams?.find((t) => t.id === teamId)?.name ?? null;
  const { startSession } = useWorkspaceSwitchStore.getState();
  startSession(teamName);
  useSubscriptionStore.getState().setPlan("free");
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
        queryKey: ["tasks", teamId, "mine"],
        queryFn: () =>
          api.get<{ tasks: Task[]; nextCursor: string | null }>(`/api/teams/${teamId}/tasks?myTasks=true`),
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
