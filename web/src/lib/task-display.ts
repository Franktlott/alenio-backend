import { isSameDay, startOfDay } from "./calendar-mobile-parity";
import type { ApiTask } from "./api";
import { isRecurringTask } from "./recurring-task";
import { normalizeTaskStatus } from "./task-status";

export function priorityRank(p: string): number {
  if (p === "urgent") return 4;
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  return 0;
}

export function priorityLabel(p: string): string {
  if (p === "urgent") return "Urgent";
  if (p === "high") return "High";
  if (p === "medium") return "Medium";
  if (p === "low") return "Low";
  return "—";
}

export function priorityClass(p: string): string {
  if (p === "urgent") return "enterprise-priority enterprise-priority-urgent";
  if (p === "high") return "enterprise-priority enterprise-priority-high";
  if (p === "medium") return "enterprise-priority enterprise-priority-medium";
  if (p === "low") return "enterprise-priority enterprise-priority-low";
  return "enterprise-priority enterprise-priority-none";
}

export function isTaskOverdue(task: Pick<ApiTask, "status" | "dueDate">, now = new Date()): boolean {
  if (task.status === "done" || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < startOfDay(now);
}

export function statusLabel(task: Pick<ApiTask, "status" | "dueDate">, now = new Date()): string {
  const status = normalizeTaskStatus(task.status);
  if (status === "done") return "Completed";
  if (isTaskOverdue(task, now)) return "Overdue";
  return "Open";
}

export function statusClass(task: Pick<ApiTask, "status" | "dueDate">, now = new Date()): string {
  const status = normalizeTaskStatus(task.status);
  if (status === "done") return "enterprise-status enterprise-status-done";
  if (isTaskOverdue(task, now)) return "enterprise-status enterprise-status-overdue";
  return "enterprise-status enterprise-status-pending";
}

export function formatTaskDue(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = startOfDay(now);
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (isSameDay(d, today)) {
    const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `Today · ${timePart}`;
  }
  if (d < today) return `Overdue · ${datePart}`;
  return datePart;
}

export function formatDoneLabel(task: Pick<ApiTask, "completedAt" | "dueDate">): string {
  if (!task.completedAt) return "Completed";
  const completed = new Date(task.completedAt);
  const datePart = completed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (task.dueDate && completed > new Date(task.dueDate)) return `Done overdue · ${datePart}`;
  return `Done · ${datePart}`;
}

export function taskBadges(task: ApiTask): string[] {
  const badges: string[] = [];
  if (task.isJoint) badges.push("Joint");
  if (isRecurringTask(task)) badges.push("Repeating");
  return badges;
}

export function assigneeInitials(name: string | null, email: string | null | undefined): string {
  const n = name?.trim() || email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return "?";
}

export function dotClassForDayTasks(dayTasks: ApiTask[]): string {
  if (!dayTasks.length) return "";
  const max = Math.max(...dayTasks.map((t) => priorityRank(t.priority)));
  if (max >= 4) return "enterprise-cal-dot enterprise-cal-dot-urgent";
  if (max >= 3) return "enterprise-cal-dot enterprise-cal-dot-high";
  if (max >= 2) return "enterprise-cal-dot enterprise-cal-dot-med";
  return "enterprise-cal-dot enterprise-cal-dot-low";
}
