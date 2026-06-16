export const TASK_STATUSES = ["todo", "reviewed", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Map legacy in_progress to reviewed; default unknown to todo. */
export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (status === "done") return "done";
  if (status === "reviewed" || status === "in_progress") return "reviewed";
  return "todo";
}

export function isAllowedTaskStatus(status: string): status is TaskStatus {
  return TASK_STATUSES.includes(status as TaskStatus);
}
