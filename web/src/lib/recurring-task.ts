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

export function recurrenceDurationLabel(type: string, count: number): string {
  const unit = recurrenceDurationUnit(type);
  return `Repeat for ${count} ${unit}`;
}

export function recurrenceCountHint(type: string): string {
  const unit = recurrenceDurationUnit(type);
  const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return `Creates ${singular === "time" ? "that many" : `one task per ${singular}`} until the series ends.`;
}
