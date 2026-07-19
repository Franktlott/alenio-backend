import type { WalkOccurrenceRow, WalkReportingSummary, WalkRunListItem } from "./library-api";

export type DaypartKey = "breakfast" | "midday" | "afternoon" | "evening" | "overnight";
export type StatusFilter = "all" | "completed" | "open" | "overdue";
export type ShiftFilter = "all" | DaypartKey;
export type RowStatus = "complete" | "not_started" | "open" | "overdue";

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

export const STATUS_KEY: Array<{ status: RowStatus; label: string; detail: string }> = [
  {
    status: "not_started",
    label: "Not Started",
    detail: "Checklist has not been started yet (before or during the window).",
  },
  {
    status: "open",
    label: "Open",
    detail: "Started and still inside the completion window. Stays Open until the window ends.",
  },
  {
    status: "overdue",
    label: "Overdue",
    detail: "The completion window ended without finishing the checklist.",
  },
  {
    status: "complete",
    label: "Complete",
    detail: "Checklist was finished.",
  },
];

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
    return { status: "complete", statusLabel: "Complete" };
  }
  if (occ.status === "MISSED" || windowHasEnded(occ, now)) {
    return { status: "overdue", statusLabel: "Overdue" };
  }
  const started =
    occ.status === "IN_PROGRESS" ||
    Boolean(occ.runId) ||
    Boolean(occ.startedAt) ||
    Boolean(run);
  if (started) {
    return { status: "open", statusLabel: "Open" };
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

function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function statusBadgeLabel(status: RowStatus): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "overdue":
      return "Overdue";
    case "open":
      return "Open";
    default:
      return "Upcoming";
  }
}

export function statusClass(status: RowStatus) {
  switch (status) {
    case "complete":
      return "exec-center-badge--complete";
    case "overdue":
      return "exec-center-badge--overdue";
    case "open":
      return "exec-center-badge--open";
    default:
      return "exec-center-badge--not-started";
  }
}

export function timingLabel(row: DashboardRow, now = new Date()): string {
  if (row.status === "complete") {
    const at = row.occurrence.completedAt ?? row.run?.completedAt;
    return at ? `Completed at ${formatTime(at)}` : "Completed today";
  }
  const end = new Date(row.occurrence.graceEndsAt ?? row.occurrence.dueAt).getTime();
  const due = new Date(row.occurrence.dueAt).getTime();
  if (row.status === "overdue") {
    return `Overdue by ${formatDuration(now.getTime() - end)}`;
  }
  const untilDue = due - now.getTime();
  if (untilDue > 0) {
    if (untilDue < 60 * 60 * 1000) return `Due in ${formatDuration(untilDue)}`;
    return `Due at ${formatTime(row.occurrence.dueAt)}`;
  }
  return `Due at ${formatTime(row.occurrence.dueAt)}`;
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return formatTime(iso);
}

export function nextCheckRow(rows: DashboardRow[]): DashboardRow | null {
  return (
    [...rows]
      .filter((r) => r.status === "not_started" || r.status === "open")
      .sort(
        (a, b) =>
          new Date(a.occurrence.dueAt).getTime() - new Date(b.occurrence.dueAt).getTime(),
      )[0] ?? null
  );
}

export type AtRiskItem = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning";
  occurrenceId?: string;
};

export function deriveAtRiskItems(todayRows: DashboardRow[], now = new Date()): AtRiskItem[] {
  const items: AtRiskItem[] = [];

  for (const row of todayRows.filter((r) => r.status === "overdue")) {
    items.push({
      id: `${row.occurrence.id}-overdue`,
      title: row.occurrence.template?.name ?? "Checklist",
      detail: timingLabel(row, now),
      tone: "danger",
      occurrenceId: row.occurrence.id,
    });
  }

  for (const row of todayRows) {
    const run = row.run;
    if (!run?.items) {
      if (row.openCa > 0 && row.status !== "overdue") {
        items.push({
          id: `${row.occurrence.id}-ca`,
          title: row.occurrence.template?.name ?? "Checklist",
          detail: `${row.openCa} open corrective action${row.openCa === 1 ? "" : "s"}`,
          tone: "danger",
          occurrenceId: row.occurrence.id,
        });
      }
      continue;
    }
    for (const item of run.items) {
      const resp = item.response;
      if (!resp) continue;
      if (resp.failed || resp.status === "FAIL" || resp.status === "NEEDS_ACTION") {
        let detail = "Needs attention";
        const value = (resp.response as { value?: number; unit?: string } | undefined)?.value;
        const unit = (resp.response as { value?: number; unit?: string } | undefined)?.unit;
        if (typeof value === "number") {
          detail = `${value}${unit === "C" ? "°C" : "°F"} — outside safe range`;
        } else if (resp.status === "NEEDS_ACTION") {
          detail = "Corrective action required";
        }
        items.push({
          id: `${row.occurrence.id}-${item.id}`,
          title: item.title,
          detail,
          tone: "danger",
          occurrenceId: row.occurrence.id,
        });
      }
      for (const ca of resp.correctiveActions ?? []) {
        if (ca.status === "PENDING") {
          items.push({
            id: `${row.occurrence.id}-${ca.id}`,
            title: ca.title || item.title,
            detail: `Open CA · ${row.occurrence.template?.name ?? "Checklist"}`,
            tone: "warning",
            occurrenceId: row.occurrence.id,
          });
        }
      }
    }
  }
  return items.slice(0, 10);
}

export function statusSortPriority(status: RowStatus): number {
  switch (status) {
    case "overdue":
      return 0;
    case "open":
      return 1;
    case "not_started":
      return 2;
    case "complete":
      return 3;
    default:
      return 4;
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
  const overdue = rows.filter((r) => r.status === "overdue").length;
  if (overdue > 0) return 0;
  const open = rows.filter((r) => r.status === "open" || r.status === "not_started").length;
  if (open > 0) return 1;
  return 2;
}

export type ActivityItem = {
  id: string;
  userName: string;
  checklistName: string;
  at: string;
};

export function deriveRecentActivity(todayRows: DashboardRow[]): ActivityItem[] {
  return todayRows
    .filter((r) => r.status === "complete")
    .map((r) => ({
      id: r.occurrence.id,
      userName: r.userName ?? "Teammate",
      checklistName: r.occurrence.template?.name ?? "Checklist",
      at: r.occurrence.completedAt ?? r.run?.completedAt ?? r.occurrence.dueAt,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);
}
