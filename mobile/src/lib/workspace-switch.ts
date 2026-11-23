import { CancelledError, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import type { Team, Task, CalendarEvent } from "@/lib/types";
import { hasTeamPlan, toPersistedPlan } from "@/lib/plan-access-copy";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTeamStore } from "@/lib/state/team-store";

/** Later switches win. An older prefetch must not rewrite the plan afterward. */
let workspaceSwitchGeneration = 0;

function isQueryCancelled(error: unknown): boolean {
  return error instanceof CancelledError;
}

function removeTeamScopedQueries(queryClient: QueryClient, teamId: string) {
  queryClient.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(teamId),
  });
}

async function invalidateRelationshipQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["connections"] }),
    queryClient.invalidateQueries({ queryKey: ["person"] }),
    queryClient.invalidateQueries({ queryKey: ["profile"] }),
    queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] }),
    queryClient.invalidateQueries({ queryKey: ["user-search"] }),
    queryClient.invalidateQueries({ queryKey: ["dms"] }),
  ]);
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
  try {
    removeTeamScopedQueries(queryClient, removedTeamId);
    await invalidateRelationshipQueries(queryClient);

    const freshTeams = await fetchFreshTeams(queryClient);

    if (activeTeamId === removedTeamId) {
      if (freshTeams.length > 0) {
        await performWorkspaceSwitch(
          freshTeams[0].id,
          removedTeamId,
          setActiveTeamId,
          queryClient,
        );
      } else {
        // Leaving the last workspace keeps you in the app: identity, DMs and
        // connections are account-level and survive the departure.
        setActiveTeamId(null);
        useSubscriptionStore.getState().setPlan("free");
      }
    }

    return freshTeams;
  } catch (error) {
    // removeQueries / invalidate can cancel in-flight fetches mid-switch.
    if (isQueryCancelled(error)) return [];
    throw error;
  }
}

/** If the active workspace no longer exists, switch to another or clear selection. */
export async function reconcileActiveTeamAfterRemoval(
  activeTeamId: string | null,
  setActiveTeamId: (id: string | null) => void,
  queryClient: QueryClient,
): Promise<void> {
  if (!activeTeamId) return;

  try {
    const freshTeams = await fetchFreshTeams(queryClient);
    if (freshTeams.some((team) => team.id === activeTeamId)) return;

    removeTeamScopedQueries(queryClient, activeTeamId);
    await invalidateRelationshipQueries(queryClient);

    if (freshTeams.length > 0) {
      await performWorkspaceSwitch(
        freshTeams[0].id,
        activeTeamId,
        setActiveTeamId,
        queryClient,
      );
      return;
    }

    setActiveTeamId(null);
    useSubscriptionStore.getState().setPlan("free");
  } catch (error) {
    // Focus reconcile races with navigation / cancelQueries — not user-facing.
    if (isQueryCancelled(error)) return;
  }
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
  // Read the store at call time. A closed-over id makes a second switch look
  // like a no-op, or lets an older call finish against the wrong workspace.
  const currentTeamId = useTeamStore.getState().activeTeamId ?? activeTeamId;
  if (!teamId || teamId === currentTeamId) return false;

  const generation = ++workspaceSwitchGeneration;
  setActiveTeamId(teamId);
  void loadSwitchedWorkspace(teamId, generation, queryClient);
  return true;
}

async function loadSwitchedWorkspace(
  teamId: string,
  generation: number,
  queryClient: QueryClient,
): Promise<void> {
  const stillSelected = () =>
    generation === workspaceSwitchGeneration &&
    useTeamStore.getState().activeTeamId === teamId;

  try {
    await queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey;
        if (!Array.isArray(key)) return false;
        if (key[0] === "teams") return true;
        return key.includes(teamId);
      },
    });

    if (!stillSelected()) return;

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
        queryFn: () =>
          api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
            `/api/teams/${teamId}/subscription`,
          ),
      }),
    ]);

    if (!stillSelected()) return;

    useSubscriptionStore.getState().setPlan(toPersistedPlan(subscription));

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
    } else if (stillSelected()) {
      queryClient.removeQueries({ queryKey: ["tasks", teamId] });
      queryClient.removeQueries({ queryKey: ["calendar-events", teamId] });
    }
  } catch (error) {
    // Newer switch, removeQueries, or cancel — screen loads its own data.
    if (isQueryCancelled(error)) return;
  }
}
