import type { QueryClient } from "@tanstack/react-query";
import type { ApiCalendarEvent, ApiTask } from "./api";
import { queryKeys } from "./query-keys";

export type DashboardQueryData = {
  tasks: ApiTask[];
  events: ApiCalendarEvent[];
};

export function getDashboardSnapshot(
  queryClient: QueryClient,
  teamId: string,
): DashboardQueryData | undefined {
  return queryClient.getQueryData<DashboardQueryData>(queryKeys.dashboard(teamId));
}

export function patchDashboardTasks(
  queryClient: QueryClient,
  teamId: string,
  patch: (tasks: ApiTask[]) => ApiTask[],
) {
  queryClient.setQueryData<DashboardQueryData>(queryKeys.dashboard(teamId), (old) => {
    if (!old) return old;
    return { ...old, tasks: patch(old.tasks) };
  });
}

export function upsertDashboardTask(queryClient: QueryClient, teamId: string, task: ApiTask) {
  patchDashboardTasks(queryClient, teamId, (tasks) => {
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index === -1) return [task, ...tasks];
    const next = [...tasks];
    next[index] = { ...next[index], ...task };
    return next;
  });
}

export function upsertDashboardTasks(queryClient: QueryClient, teamId: string, created: ApiTask[]) {
  if (created.length === 0) return;
  patchDashboardTasks(queryClient, teamId, (tasks) => {
    let next = [...tasks];
    for (const task of created) {
      const index = next.findIndex((item) => item.id === task.id);
      if (index >= 0) {
        next[index] = { ...next[index], ...task };
      } else {
        next = [task, ...next];
      }
    }
    return next;
  });
}

export function removeDashboardTask(queryClient: QueryClient, teamId: string, taskId: string) {
  patchDashboardTasks(queryClient, teamId, (tasks) => tasks.filter((task) => task.id !== taskId));
}

export function markDashboardTaskDone(queryClient: QueryClient, teamId: string, taskId: string) {
  patchDashboardTasks(queryClient, teamId, (tasks) =>
    tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: "done",
            completedAt: task.completedAt ?? new Date().toISOString(),
          }
        : task,
    ),
  );
}

export function reconcileDashboardTasks(queryClient: QueryClient, teamId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(teamId) });
}
