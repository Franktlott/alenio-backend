import type { QueryClient } from "@tanstack/react-query";

/** Invalidate all task-related caches so lists and badges update without a manual refresh. */
export function invalidateTaskCaches(queryClient: QueryClient, teamId?: string | null) {
  if (teamId) {
    void queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks-count", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["team-overview-tasks", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["team-momentum", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["series-tasks", teamId] });
  }
  void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  void queryClient.invalidateQueries({ queryKey: ["tasks-count"] });
  void queryClient.invalidateQueries({ queryKey: ["series-tasks"] });
  /** Home reads its own cross-workspace lists, keyed outside the team id. */
  void queryClient.invalidateQueries({ queryKey: ["home-today"] });
}

const pendingTaskRefresh = new Map<string, ReturnType<typeof setTimeout>>();

/** Refresh the open task, notes, and workspace lists when another person changes it. */
export function applyTeamTaskUpdatedEvent(
  queryClient: QueryClient,
  event: { teamId: string; taskId: string },
) {
  const stamp = `${event.teamId}:${event.taskId}`;
  const existing = pendingTaskRefresh.get(stamp);
  if (existing) clearTimeout(existing);
  pendingTaskRefresh.set(
    stamp,
    setTimeout(() => {
      pendingTaskRefresh.delete(stamp);
      invalidateTaskCaches(queryClient, event.teamId);
      void queryClient.invalidateQueries({ queryKey: ["task", event.taskId, event.teamId] });
      void queryClient.invalidateQueries({ queryKey: ["task-notes", event.teamId, event.taskId] });
    }, 80),
  );
}
