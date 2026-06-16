export const TASK_STATUSES = ["todo", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Map legacy statuses to open or completed. */
export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (status === "done") return "done";
  return "todo";
}

export function isAllowedTaskStatus(status: string): status is TaskStatus {
  return TASK_STATUSES.includes(status as TaskStatus);
}
