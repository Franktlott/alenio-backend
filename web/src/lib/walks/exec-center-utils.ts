import type { WalkOccurrenceRow, WalkReportingSummary, WalkRunListItem } from "./library-api";

export type DaypartKey = "breakfast" | "midday" | "afternoon" | "evening" | "overnight";
export type StatusFilter =
  | "all"
  | "completed"
  | "in_progress"
  | "due_soon"
  | "overdue"
  | "not_started";
export type ShiftFilter = "all" | DaypartKey;
export type RowStatus = "complete" | "not_started" | "in_progress" | "due_soon" | "overdue";

export type DashboardRow = {
  occurrence: WalkOccurrenceRow;
  run: WalkRunListItem | null;
  status: RowStatus;
  statusLabel: string;
  completionPct: number;
  openCa: number;
  userName: string | null;
  daypart: DaypartKey;
  dayKey: "today" | "tomorrow" | "other";
};

export type StatusCounts = {
  overdue: number;
  due_soon: number;
  in_progress: number;
  completed: number;
  not_started: number;
};

export const DAYPARTS: Array<{
  key: DaypartKey;
  label: string;
  rangeLabel: string;
}> = [
  { key: "breakfast", label: "Breakfast", rangeLabel: "6:00 AM – 11:00 AM" },
  { key: "midday", label: "Midday", rangeLabel: "11:00 AM – 3:00 PM" },
  { key: "afternoon", label: "Afternoon", rangeLabel: "3:00 PM – 5:00 PM" },
  { key: "evening", label: "Evening", rangeLabel: "5:00 PM – 9:00 PM" },
  { key: "overnight", label: "Overnight", rangeLabel: "9:00 PM – 6:00 AM" },
];

export const PAGE_SIZE = 10;
export const DUE_SOON_MS = 60 * 60 * 1000;

export function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function startOfLocalWeek(d = new Date()) {
  const day = startOfLocalDay(d);
  const weekday = day.getDay(); // 0 = Sun
  return addDays(day, -weekday);
}

export function isSameLocalDay(iso: string, day: Date) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function daypartFor(iso: string): DaypartKey {
  const hour = new Date(iso).getHours();
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "overnight";
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDateChip(d = new Date()) {
  return `Today, ${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`;
}

export function formatUpdated(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return "—";
}

export function rate(summary: WalkReportingSummary | null): number {
  if (!summary || summary.completion.occurrenceTotal === 0) return 100;
  const { completed, missed, late, completionRate } = summary.completion;
  if (completed === 0 && missed === 0 && late === 0) return 100;
  return completionRate ?? 100;
}

export function deltaLabel(current: number, prior: number) {
  const diff = current - prior;
  if (diff === 0) return { text: "0%", up: null as boolean | null };
  return { text: `${Math.abs(diff)}%`, up: diff > 0 };
}

export function windowHasEnded(occ: WalkOccurrenceRow, now: Date): boolean {
  if (occ.graceEndsAt) return now > new Date(occ.graceEndsAt);
  if (occ.dueAt) return now > new Date(occ.dueAt);
  return false;
}

export function mapRowStatus(
  occ: WalkOccurrenceRow,
  run: WalkRunListItem | null,
  now: Date,
): { status: RowStatus; statusLabel: string } {
  if (occ.status === "COMPLETED" || occ.status === "COMPLETED_LATE") {
    return { status: "complete", statusLabel: "Completed" };
  }
  if (occ.status === "MISSED" || windowHasEnded(occ, now)) {
    return { status: "overdue", statusLabel: "Overdue" };
  }

  const dueMs = new Date(occ.dueAt).getTime() - now.getTime();
  if (dueMs <= DUE_SOON_MS) {
    return { status: "due_soon", statusLabel: "Due Soon" };
  }

  const started =
    occ.status === "IN_PROGRESS" ||
    Boolean(occ.runId) ||
    Boolean(occ.startedAt) ||
    Boolean(run);
  if (started) {
    return { status: "in_progress", statusLabel: "In Progress" };
  }
  return { status: "not_started", statusLabel: "Not Started" };
}

export function completionFor(occ: WalkOccurrenceRow, run: WalkRunListItem | null): number {
  if (occ.status === "COMPLETED" || occ.status === "COMPLETED_LATE") {
    if (run?.progress && run.progress.total > 0) {
      return Math.round((run.progress.answered / run.progress.total) * 100);
    }
    return 100;
  }
  if (run?.progress && run.progress.total > 0) {
    return Math.round((run.progress.answered / run.progress.total) * 100);
  }
  return 0;
}

export function openCaFor(run: WalkRunListItem | null): number {
  if (!run?.items) return 0;
  let n = 0;
  for (const item of run.items) {
    const cas = item.response?.correctiveActions ?? [];
    for (const ca of cas) {
      if (ca.status === "PENDING") n += 1;
    }
    if (!cas.length && item.response?.status === "NEEDS_ACTION") n += 1;
  }
  return n;
}

export function buildDashboardRow(
  occurrence: WalkOccurrenceRow,
  run: WalkRunListItem | null,
  now = new Date(),
): DashboardRow {
  const today = startOfLocalDay(now);
  const tomorrow = addDays(today, 1);
  const mapped = mapRowStatus(occurrence, run, now);
  let dayKey: DashboardRow["dayKey"] = "other";
  if (isSameLocalDay(occurrence.dueAt, today)) dayKey = "today";
  else if (isSameLocalDay(occurrence.dueAt, tomorrow)) dayKey = "tomorrow";
  return {
    occurrence,
    run,
    status: mapped.status,
    statusLabel: mapped.statusLabel,
    completionPct: completionFor(occurrence, run),
    openCa: openCaFor(run),
    userName: run?.startedByName ?? null,
    daypart: daypartFor(occurrence.dueAt),
    dayKey,
  };
}

export function statusBadgeLabel(status: RowStatus): string {
  switch (status) {
    case "complete":
      return "Completed";
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due Soon";
    case "in_progress":
      return "In Progress";
    default:
      return "Not Started";
  }
}

export function statusClass(status: RowStatus) {
  switch (status) {
    case "complete":
      return "exec-center-badge--complete";
    case "overdue":
      return "exec-center-badge--overdue";
    case "due_soon":
      return "exec-center-badge--due-soon";
    case "in_progress":
      return "exec-center-badge--in-progress";
    default:
      return "exec-center-badge--not-started";
  }
}

export function progressToneClass(status: RowStatus) {
  switch (status) {
    case "complete":
      return "exec-center-progress--complete";
    case "overdue":
      return "exec-center-progress--overdue";
    case "due_soon":
      return "exec-center-progress--due-soon";
    case "in_progress":
      return "exec-center-progress--in-progress";
    default:
      return "exec-center-progress--not-started";
  }
}

export function statusCounts(rows: DashboardRow[]): StatusCounts {
  const counts: StatusCounts = {
    overdue: 0,
    due_soon: 0,
    in_progress: 0,
    completed: 0,
    not_started: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case "overdue":
        counts.overdue += 1;
        break;
      case "due_soon":
        counts.due_soon += 1;
        break;
      case "in_progress":
        counts.in_progress += 1;
        break;
      case "complete":
        counts.completed += 1;
        break;
      default:
        counts.not_started += 1;
    }
  }
  return counts;
}

export function openActionsCount(rows: DashboardRow[]): number {
  return rows.reduce((sum, row) => sum + row.openCa, 0);
}

/** Daypart header alert pill — highest urgency first. */
export function daypartAlertBadge(
  rows: DashboardRow[],
): { text: string; tone: "overdue" | "due_soon" | "not_started" } | null {
  const overdue = rows.filter((r) => r.status === "overdue").length;
  if (overdue > 0) return { text: `Overdue: ${overdue}`, tone: "overdue" };
  const dueSoon = rows.filter((r) => r.status === "due_soon").length;
  if (dueSoon > 0) return { text: `Due Soon: ${dueSoon}`, tone: "due_soon" };
  const notStarted = rows.filter((r) => r.status === "not_started").length;
  if (notStarted > 0 && notStarted === rows.length) {
    return { text: `Not Started: ${notStarted}`, tone: "not_started" };
  }
  return null;
}

export function rowMatchesStatusFilter(row: DashboardRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "completed":
      return row.status === "complete";
    case "in_progress":
      return row.status === "in_progress";
    case "due_soon":
      return row.status === "due_soon";
    case "overdue":
      return row.status === "overdue";
    case "not_started":
      return row.status === "not_started";
    default:
      return true;
  }
}

export function statusSortPriority(status: RowStatus): number {
  switch (status) {
    case "overdue":
      return 0;
    case "due_soon":
      return 1;
    case "in_progress":
      return 2;
    case "not_started":
      return 3;
    case "complete":
      return 4;
    default:
      return 5;
  }
}

export function sortRowsForDisplay(rows: DashboardRow[]): DashboardRow[] {
  return [...rows].sort((a, b) => {
    const pri = statusSortPriority(a.status) - statusSortPriority(b.status);
    if (pri !== 0) return pri;
    return new Date(a.occurrence.dueAt).getTime() - new Date(b.occurrence.dueAt).getTime();
  });
}

export function daypartGroupPriority(rows: DashboardRow[]): number {
  if (rows.some((r) => r.status === "overdue")) return 0;
  if (rows.some((r) => r.status === "due_soon" || r.status === "in_progress")) return 1;
  if (rows.some((r) => r.status === "not_started")) return 2;
  return 3;
}

/** Decorative sparkline points 0–100 from current/prior rates. */
export function sparkPoints(current: number, prior: number): string {
  const a = Math.max(0, Math.min(100, prior));
  const b = Math.max(0, Math.min(100, Math.round((prior + current) / 2)));
  const c = Math.max(0, Math.min(100, current));
  const y = (v: number) => 28 - (v / 100) * 22;
  return `M2 ${y(a)} L18 ${y(b)} L34 ${y(Math.min(100, b + 4))} L50 ${y(c)}`;
}
