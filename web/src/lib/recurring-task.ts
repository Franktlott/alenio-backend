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

export function recurrenceDurationLabel(type: string, count: number): string {
  const unit = recurrenceDurationUnit(type);
  return `Repeat for ${count} ${unit}`;
}

export function recurrenceCountHint(type: string): string {
  const unit = recurrenceDurationUnit(type);
  const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  const max = maxRecurrenceCount(type);
  return `Creates one task per ${singular} until the series ends (max ${max}).`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function formatRecurrenceRuleSummary(input: {
  type: string;
  occurrenceCount: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}): string {
  const count = Math.max(1, input.occurrenceCount || 1);
  const typeLabel = input.type.charAt(0).toUpperCase() + input.type.slice(1);
  const parts = [typeLabel, recurrenceDurationLabel(input.type, count)];

  if (input.type === "weekly" && input.dayOfWeek != null) {
    parts.push(`Every ${WEEKDAY_NAMES[input.dayOfWeek] ?? "week"}`);
  }
  if (input.type === "monthly" && input.dayOfMonth != null) {
    parts.push(`Day ${input.dayOfMonth} of each month`);
  }

  return parts.join(" · ");
}
