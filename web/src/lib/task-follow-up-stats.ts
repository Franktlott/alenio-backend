import { startOfDay } from "./calendar-mobile-parity";
import type { ApiTask } from "./api";

export const TASK_DUE_SOON_DAYS = 3;

export type TaskFollowUpBucket = "needsAttention" | "dueSoon" | "onTrack";

export function classifyActiveTaskDue(
  task: Pick<ApiTask, "status" | "dueDate">,
  now = new Date(),
): TaskFollowUpBucket | null {
  if (task.status === "done" || !task.dueDate) return null;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (days <= 0) return "needsAttention";
  if (days <= TASK_DUE_SOON_DAYS) return "dueSoon";
  return "onTrack";
}

export type TaskFollowUpStats = {
  needsAttention: number;
  dueSoon: number;
  onTrack: number;
  avgFollowUpDays: number | null;
};

export function computeTaskFollowUpStats(tasks: ApiTask[], now = new Date()): TaskFollowUpStats {
  const stats: TaskFollowUpStats = {
    needsAttention: 0,
    dueSoon: 0,
    onTrack: 0,
    avgFollowUpDays: null,
  };

  for (const task of tasks) {
    if (task.status === "done") continue;
    const bucket = classifyActiveTaskDue(task, now);
    if (bucket) stats[bucket]++;
  }

  const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const durations: number[] = [];

  for (const task of tasks) {
    if (task.status !== "done" || !task.completedAt) continue;
    const completed = new Date(task.completedAt);
    if (Number.isNaN(completed.getTime()) || completed < monthStart) continue;
    if (!task.createdAt) continue;
    const created = new Date(task.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const days = (completed.getTime() - created.getTime()) / 86_400_000;
    if (days >= 0) durations.push(days);
  }

  if (durations.length > 0) {
    stats.avgFollowUpDays = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  }

  return stats;
}

export function formatAvgFollowUpDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 10) return `${days.toFixed(1)} days`;
  return `${Math.round(days)} days`;
}
