import type { Task } from "@/lib/types";
import { normalizeTaskStatus } from "@/lib/task-status";

export function isTaskOverdue(
  task: Pick<Task, "status" | "dueDate">,
  now = new Date(),
): boolean {
  if (normalizeTaskStatus(task.status) === "done" || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}
