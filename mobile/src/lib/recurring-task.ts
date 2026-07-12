export type RecurrenceScope = "task" | "series";

export type RecurringTaskLike = {
  recurrenceSeriesId?: string | null;
  recurrenceRule?: unknown | null;
};

export function isRecurringTask(task: RecurringTaskLike): boolean {
  return !!(task.recurrenceSeriesId || task.recurrenceRule);
}

export function recurrenceDurationUnit(type: string): string {
  switch (type) {
    case "daily":
      return "days";
    case "weekly":
      return "weeks";
    case "monthly":
      return "months";
    default:
      return "times";
  }
}

export function maxRecurrenceCount(type: string): number {
  switch (type) {
    case "daily":
      return 365;
    case "weekly":
      return 52;
    case "monthly":
      return 12;
    default:
      return 52;
  }
}

export function clampRecurrenceCount(raw: string | number, type: string): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Math.floor(raw);
  const count = Number.isFinite(n) ? n : 1;
  return Math.min(maxRecurrenceCount(type), Math.max(1, count || 1));
}

export function recurrenceCountHint(type: string): string {
  const unit = recurrenceDurationUnit(type);
  const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  const max = maxRecurrenceCount(type);
  return `Creates one task per ${singular} (max ${max}).`;
}
