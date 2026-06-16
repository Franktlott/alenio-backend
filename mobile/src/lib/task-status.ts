export type TaskStatus = "todo" | "done";

export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (status === "done") return "done";
  return "todo";
}

export const STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: "Open", value: "todo" },
  { label: "Completed", value: "done" },
];

export function statusLabel(status: string | null | undefined, overdue = false): string {
  const normalized = normalizeTaskStatus(status);
  if (normalized === "done") return "Completed";
  if (overdue) return "Overdue";
  return "Open";
}
