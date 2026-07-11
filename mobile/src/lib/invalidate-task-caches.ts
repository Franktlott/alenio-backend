import type { QueryClient } from "@tanstack/react-query";

/** Invalidate all task-related caches so lists and badges update without a manual refresh. */
export function invalidateTaskCaches(queryClient: QueryClient, teamId?: string | null) {
  if (teamId) {
    void queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks-count", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["team-overview-tasks", teamId] });
    void queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
  }
  void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  void queryClient.invalidateQueries({ queryKey: ["tasks-count"] });
}
