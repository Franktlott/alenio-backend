import type { WalkSchedule, WalkScheduleWindow } from "./library-api";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function minutesToLabel(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function windowLabel(w: Pick<WalkScheduleWindow, "startMinutes" | "dueMinutes">) {
  return `${minutesToLabel(w.startMinutes)} – ${minutesToLabel(w.dueMinutes)}`;
}

function formatDayRange(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.length === 7) return "Daily";
  if (sorted.length === 1) return DAY_SHORT[sorted[0]] ?? "Weekly";
  return sorted.map((d) => DAY_SHORT[d]).join(", ");
}

function intervalLabel(minutes: number | null | undefined) {
  const m = minutes && minutes > 0 ? minutes : 240;
  if (m % 60 === 0) {
    const h = m / 60;
    return `Every ${h} hour${h === 1 ? "" : "s"}`;
  }
  return `Every ${m} minutes`;
}

/** Compact table cell summary for a single schedule. */
export function formatScheduleSummary(schedule: WalkSchedule): string {
  if (!schedule.isActive) {
    return `Paused · ${formatScheduleSummaryActive(schedule)}`;
  }
  return formatScheduleSummaryActive(schedule);
}

function formatScheduleSummaryActive(schedule: WalkSchedule): string {
  const times = [...(schedule.windows ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((w) => minutesToLabel(w.startMinutes));

  if (schedule.recurrence === "INTERVAL") {
    return intervalLabel(schedule.intervalMinutes);
  }

  if (schedule.recurrence === "ONCE") {
    const t = times[0] ? ` · ${times[0]}` : "";
    return `One-time${t}`;
  }

  if (schedule.recurrence === "WEEKLY") {
    const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
    const dayPart = days.length ? formatDayRange(days) : "Weekly";
    const timePart = times.length ? ` · ${times.join(", ")}` : "";
    return `${dayPart}${timePart}`;
  }

  // DAILY default
  const timePart = times.length ? ` · ${times.join(", ")}` : "";
  return `Daily${timePart}`;
}

/** Human-readable preview sentence for the schedule form. */
export function formatSchedulePreview(input: {
  recurrence: string;
  daysOfWeek?: number[] | null;
  intervalMinutes?: number | null;
  windows: Array<{ startMinutes: number; dueMinutes: number }>;
}): string {
  const times = input.windows.map((w) => minutesToLabel(w.startMinutes));
  if (input.recurrence === "INTERVAL") {
    return `Runs ${intervalLabel(input.intervalMinutes).toLowerCase()}.`;
  }
  if (input.recurrence === "ONCE") {
    return times[0]
      ? `Runs once at ${times[0]}.`
      : "Runs once on the effective start date.";
  }
  if (input.recurrence === "WEEKLY") {
    const days = Array.isArray(input.daysOfWeek) ? input.daysOfWeek : [];
    const dayPart = days.length ? formatDayRange(days) : "selected days";
    if (!times.length) return `Runs on ${dayPart}.`;
    if (times.length === 1) return `Runs ${dayPart} at ${times[0]}.`;
    const last = times[times.length - 1];
    const rest = times.slice(0, -1).join(", ");
    return `Runs ${dayPart} at ${rest}, and ${last}.`;
  }
  if (!times.length) return "Runs every day.";
  if (times.length === 1) return `Runs every day at ${times[0]}.`;
  const last = times[times.length - 1];
  const rest = times.slice(0, -1).join(", ");
  return `Runs every day at ${rest}, and ${last}.`;
}

/** Aggregate summary for a walk's schedules (list page). */
export function summarizeWalkSchedules(schedules: WalkSchedule[]): {
  label: string;
  status: "scheduled" | "unscheduled" | "paused";
} {
  if (!schedules.length) {
    return { label: "Not scheduled", status: "unscheduled" };
  }
  const active = schedules.filter((s) => s.isActive);
  if (!active.length) {
    return { label: "Paused", status: "paused" };
  }
  if (active.length === 1) {
    return { label: formatScheduleSummaryActive(active[0]), status: "scheduled" };
  }
  return {
    label: `${active.length} schedules · ${formatScheduleSummaryActive(active[0])}`,
    status: "scheduled",
  };
}

export function assignScopeLabel(schedule: Pick<WalkSchedule, "assignScope" | "assignRole">) {
  if (schedule.assignRole?.trim()) return schedule.assignRole.trim();
  switch (schedule.assignScope) {
    case "ROLE":
      return "Role assignees";
    case "MEMBER":
      return "Selected members";
    case "TEAM":
      return "Team";
    case "ANY":
      return "Anyone";
    default:
      return "All associates";
  }
}

export { DAY_LABELS };
