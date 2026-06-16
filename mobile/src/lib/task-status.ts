export type TaskStatus = "todo" | "reviewed" | "done";

export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (status === "done") return "done";
  if (status === "reviewed" || status === "in_progress") return "reviewed";
  return "todo";
}

export const STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: "Open", value: "todo" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Completed", value: "done" },
];

export function statusLabel(status: string | null | undefined, overdue = false): string {
  const normalized = normalizeTaskStatus(status);
  if (normalized === "done") return "Completed";
  if (normalized === "reviewed") return "Reviewed";
  if (overdue) return "Overdue";
  return "Open";
}
