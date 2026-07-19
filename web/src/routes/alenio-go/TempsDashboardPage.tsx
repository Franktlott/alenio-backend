import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { ExecCenterCompleteModal } from "../../components/alenio-go/ExecCenterCompleteModal";
import { ExecCenterResultsModal } from "../../components/alenio-go/ExecCenterResultsModal";
import {
  fetchWalkOccurrences,
  fetchWalkReporting,
  fetchWalkRuns,
  type WalkOccurrenceRow,
  type WalkReportingSummary,
  type WalkRunListItem,
} from "../../lib/walks/library-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type DaypartKey = "breakfast" | "midday" | "afternoon" | "evening" | "overnight";
type StatusFilter = "all" | "completed" | "open" | "overdue";
type ShiftFilter = "all" | DaypartKey;
type RowStatus = "complete" | "not_started" | "open" | "overdue";

const STATUS_KEY: Array<{ status: RowStatus; label: string; detail: string }> = [
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

type DashboardRow = {
  occurrence: WalkOccurrenceRow;
  run: WalkRunListItem | null;
  status: RowStatus;
  statusLabel: string;
  completionPct: number;
  openCa: number;
  userName: string | null;
  hasNotes: boolean;
  daypart: DaypartKey;
};

const DAYPARTS: Array<{
  key: DaypartKey;
  label: string;
  rangeLabel: string;
  startHour: number;
  endHour: number;
}> = [
  { key: "breakfast", label: "Breakfast", rangeLabel: "6:00 AM – 11:00 AM", startHour: 6, endHour: 11 },
  { key: "midday", label: "Midday", rangeLabel: "11:00 AM – 3:00 PM", startHour: 11, endHour: 15 },
  { key: "afternoon", label: "Afternoon", rangeLabel: "3:00 PM – 5:00 PM", startHour: 15, endHour: 17 },
  { key: "evening", label: "Evening", rangeLabel: "5:00 PM – 9:00 PM", startHour: 17, endHour: 21 },
  { key: "overnight", label: "Overnight", rangeLabel: "9:00 PM – 6:00 AM", startHour: 21, endHour: 4 },
];

const PAGE_SIZE = 10;

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function daypartFor(iso: string): DaypartKey {
  const hour = new Date(iso).getHours();
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "overnight";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateChip(d = new Date()) {
  return `Today, ${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`;
}

function formatUpdated(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return "—";
}

function rate(summary: WalkReportingSummary | null): number {
  if (!summary || summary.completion.occurrenceTotal === 0) return 100;
  const { completed, missed, late, completionRate } = summary.completion;
  // Nothing closed yet → default 100% (not 0%)
  if (completed === 0 && missed === 0 && late === 0) return 100;
  return completionRate ?? 100;
}

function deltaLabel(current: number, prior: number) {
  const diff = current - prior;
  if (diff === 0) return { text: "0%", up: null as boolean | null };
  return { text: `${Math.abs(diff)}%`, up: diff > 0 };
}

function sparkSeries(ratePct: number, seed: number): number[] {
  const base = ratePct;
  const out: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const wobble = Math.sin((i + seed) * 0.9) * 8 + Math.cos((i + seed) * 0.35) * 5;
    out.push(Math.max(8, Math.min(100, base + wobble - 6 + (i / 11) * 4)));
  }
  out[out.length - 1] = base;
  return out;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 56;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 3) - 1.5;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="exec-center-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} />
    </svg>
  );
}

function windowHasEnded(occ: WalkOccurrenceRow, now: Date): boolean {
  if (occ.graceEndsAt) return now > new Date(occ.graceEndsAt);
  if (occ.dueAt) return now > new Date(occ.dueAt);
  return false;
}

function mapRowStatus(occ: WalkOccurrenceRow, run: WalkRunListItem | null, now: Date): {
  status: RowStatus;
  statusLabel: string;
} {
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

function completionFor(occ: WalkOccurrenceRow, run: WalkRunListItem | null, now = new Date()): number {
  if (occ.status === "COMPLETED" || occ.status === "COMPLETED_LATE") {
    if (run?.progress && run.progress.total > 0) {
      return Math.round((run.progress.answered / run.progress.total) * 100);
    }
    return 100;
  }
  if (run?.progress && run.progress.total > 0) {
    return Math.round((run.progress.answered / run.progress.total) * 100);
  }
  const isOverdue =
    occ.status === "MISSED" ||
    (windowHasEnded(occ, now) &&
      occ.status !== "COMPLETED" &&
      occ.status !== "COMPLETED_LATE");
  if (isOverdue) return 0;
  if (occ.status === "IN_PROGRESS" || occ.runId || occ.startedAt) return 0;
  // Default (not started / available with no responses yet)
  return 100;
}

function openCaFor(run: WalkRunListItem | null): number {
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

function hasNotes(run: WalkRunListItem | null): boolean {
  return Boolean(run?.items?.some((item) => Boolean(item.response?.notes?.trim())));
}

function IconPulse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 12h-4l-3 8L9 4l-3 8H2" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.6-6.2" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconChecklist() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconResults() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      aria-hidden
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 120ms ease" }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function statusClass(status: RowStatus) {
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

function barClass(pct: number, status: RowStatus) {
  if (pct >= 100 && status === "complete") return "exec-center-bar--ok";
  if (status === "overdue" || (pct > 0 && pct < 100 && status !== "complete")) return "exec-center-bar--bad";
  if (pct === 0) return "exec-center-bar--empty";
  return "exec-center-bar--ok";
}

export function TempsDashboardPage() {
  const { teamId, teamName } = useAlenioGoShell();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [occurrences, setOccurrences] = useState<WalkOccurrenceRow[]>([]);
  const [runs, setRuns] = useState<WalkRunListItem[]>([]);
  const [todayR, setTodayR] = useState<WalkReportingSummary | null>(null);
  const [yesterdayR, setYesterdayR] = useState<WalkReportingSummary | null>(null);
  const [weekR, setWeekR] = useState<WalkReportingSummary | null>(null);
  const [priorWeekR, setPriorWeekR] = useState<WalkReportingSummary | null>(null);
  const [monthR, setMonthR] = useState<WalkReportingSummary | null>(null);
  const [priorMonthR, setPriorMonthR] = useState<WalkReportingSummary | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [statusKeyOpen, setStatusKeyOpen] = useState(false);
  const [resultsRow, setResultsRow] = useState<DashboardRow | null>(null);
  const [completeRow, setCompleteRow] = useState<DashboardRow | null>(null);

  function openChecklistRow(row: DashboardRow) {
    if (row.status === "complete") {
      setCompleteRow(null);
      setResultsRow(row);
      return;
    }
    setResultsRow(null);
    setCompleteRow(row);
  }

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const todayStart = startOfLocalDay(now);
      const todayEnd = endOfLocalDay(now);
      const yStart = startOfLocalDay(addDays(now, -1));
      const yEnd = endOfLocalDay(addDays(now, -1));
      const weekStart = startOfLocalDay(addDays(now, -6));
      const priorWeekStart = startOfLocalDay(addDays(now, -13));
      const priorWeekEnd = endOfLocalDay(addDays(now, -7));
      const monthStart = startOfLocalDay(addDays(now, -29));
      const priorMonthStart = startOfLocalDay(addDays(now, -59));
      const priorMonthEnd = endOfLocalDay(addDays(now, -30));

      const [
        occs,
        runList,
        today,
        yesterday,
        week,
        priorWeek,
        month,
        priorMonth,
      ] = await Promise.all([
        fetchWalkOccurrences(teamId, {
          from: todayStart.toISOString(),
          to: todayEnd.toISOString(),
        }),
        fetchWalkRuns(teamId),
        fetchWalkReporting(teamId, { from: todayStart.toISOString(), to: todayEnd.toISOString() }),
        fetchWalkReporting(teamId, { from: yStart.toISOString(), to: yEnd.toISOString() }),
        fetchWalkReporting(teamId, { from: weekStart.toISOString(), to: todayEnd.toISOString() }),
        fetchWalkReporting(teamId, {
          from: priorWeekStart.toISOString(),
          to: priorWeekEnd.toISOString(),
        }),
        fetchWalkReporting(teamId, { from: monthStart.toISOString(), to: todayEnd.toISOString() }),
        fetchWalkReporting(teamId, {
          from: priorMonthStart.toISOString(),
          to: priorMonthEnd.toISOString(),
        }),
      ]);

      setOccurrences(occs);
      setRuns(runList);
      setTodayR(today);
      setYesterdayR(yesterday);
      setWeekR(week);
      setPriorWeekR(priorWeek);
      setMonthR(month);
      setPriorMonthR(priorMonth);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runById = useMemo(() => {
    const map = new Map<string, WalkRunListItem>();
    for (const run of runs) map.set(run.id, run);
    return map;
  }, [runs]);

  const rows = useMemo(() => {
    const now = new Date();
    return occurrences
      .map((occurrence): DashboardRow => {
        const run = occurrence.runId ? runById.get(occurrence.runId) ?? null : null;
        const mapped = mapRowStatus(occurrence, run, now);
        return {
          occurrence,
          run,
          status: mapped.status,
          statusLabel: mapped.statusLabel,
          completionPct: completionFor(occurrence, run),
          openCa: openCaFor(run),
          userName: run?.startedByName ?? null,
          hasNotes: hasNotes(run),
          daypart: daypartFor(occurrence.dueAt),
        };
      })
      .sort(
        (a, b) =>
          new Date(a.occurrence.dueAt).getTime() - new Date(b.occurrence.dueAt).getTime(),
      );
  }, [occurrences, runById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (shiftFilter !== "all" && row.daypart !== shiftFilter) return false;
      if (q) {
        const name = row.occurrence.template?.name ?? "";
        if (!name.toLowerCase().includes(q)) return false;
      }
      switch (statusFilter) {
        case "completed":
          return row.status === "complete";
        case "open":
          return row.status === "open";
        case "overdue":
          return row.status === "overdue";
        default:
          return true;
      }
    });
  }, [rows, search, statusFilter, shiftFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, shiftFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const grouped = useMemo(() => {
    return DAYPARTS.map((part) => ({
      ...part,
      rows: pageRows.filter((r) => r.daypart === part.key),
    })).filter((g) => g.rows.length > 0);
  }, [pageRows]);

  const todayRate = rate(todayR);
  const yesterdayRate = rate(yesterdayR);
  const weekRate = rate(weekR);
  const priorWeekRate = rate(priorWeekR);
  const monthRate = rate(monthR);
  const priorMonthRate = rate(priorMonthR);

  const todayDelta = deltaLabel(todayRate, yesterdayRate);
  const yesterdayDelta = deltaLabel(yesterdayRate, todayRate);
  const weekDelta = deltaLabel(weekRate, priorWeekRate);
  const monthDelta = deltaLabel(monthRate, priorMonthRate);

  function toggleGroup(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleRow(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function exportCsv() {
    const header = [
      "Time",
      "Checklist",
      "Status",
      "Completion",
      "Corrective Actions",
      "User",
      "Daypart",
    ];
    const lines = filtered.map((row) =>
      [
        formatTime(row.occurrence.dueAt),
        JSON.stringify(row.occurrence.template?.name ?? ""),
        row.statusLabel,
        `${row.completionPct}%`,
        String(row.openCa),
        JSON.stringify(row.userName ?? ""),
        row.daypart,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution-center-${startOfLocalDay().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!teamId) {
    return <EnterprisePageLoading label="Loading workspace…" />;
  }

  if (loading && !occurrences.length && !todayR) {
    return <EnterprisePageLoading label="Loading Execution Center…" />;
  }

  const showingFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(pageSafe * PAGE_SIZE, filtered.length);

  return (
    <div className="exec-center" data-testid="temps-execution-center">
      <header className="exec-center-header">
        <div className="exec-center-header-copy">
          <h1>
            <span className="exec-center-pulse" aria-hidden>
              <IconPulse />
            </span>
            Execution Center
          </h1>
          <p>Real-time overview of today&apos;s operational checklist results.</p>
        </div>
        <div className="exec-center-header-meta">
          <span className="exec-center-date-chip">{formatDateChip()}</span>
          <span className="exec-center-live">
            <span className="exec-center-live-dot" aria-hidden />
            Last updated: {formatUpdated(updatedAt)}
          </span>
          <button
            type="button"
            className="exec-center-refresh"
            aria-label="Refresh dashboard"
            onClick={() => void load()}
          >
            <IconRefresh />
          </button>
        </div>
      </header>

      {error ? <div className="exec-center-error">{error}</div> : null}

      <section className="exec-center-kpis" aria-label="Completion summary">
        <article className="exec-center-kpi">
          <div className="exec-center-kpi-top">
            <span>Today</span>
            <Sparkline values={sparkSeries(todayRate, 1)} color="#3b82f6" />
          </div>
          <strong>{todayRate}%</strong>
          <small className={todayDelta.up == null ? "" : todayDelta.up ? "is-up" : "is-down"}>
            {todayDelta.up == null ? "" : todayDelta.up ? "▲ " : "▼ "}
            {todayDelta.text} vs yesterday
          </small>
        </article>
        <article className="exec-center-kpi">
          <div className="exec-center-kpi-top">
            <span>Yesterday</span>
            <Sparkline values={sparkSeries(yesterdayRate, 2)} color="#f59e0b" />
          </div>
          <strong>{yesterdayRate}%</strong>
          <small className={yesterdayDelta.up == null ? "" : yesterdayDelta.up ? "is-up" : "is-down"}>
            {yesterdayDelta.up == null ? "" : yesterdayDelta.up ? "▲ " : "▼ "}
            {yesterdayDelta.text} vs today
          </small>
        </article>
        <article className="exec-center-kpi">
          <div className="exec-center-kpi-top">
            <span>This Week</span>
            <Sparkline values={sparkSeries(weekRate, 3)} color="#22c55e" />
          </div>
          <strong>{weekRate}%</strong>
          <small className={weekDelta.up == null ? "" : weekDelta.up ? "is-up" : "is-down"}>
            {weekDelta.up == null ? "" : weekDelta.up ? "▲ " : "▼ "}
            {weekDelta.text} vs last week
          </small>
        </article>
        <article className="exec-center-kpi">
          <div className="exec-center-kpi-top">
            <span>Last 30 Days</span>
            <Sparkline values={sparkSeries(monthRate, 4)} color="#3b82f6" />
          </div>
          <strong>{monthRate}%</strong>
          <small className={monthDelta.up == null ? "" : monthDelta.up ? "is-up" : "is-down"}>
            {monthDelta.up == null ? "" : monthDelta.up ? "▲ " : "▼ "}
            {monthDelta.text} vs prior 30
          </small>
        </article>
      </section>

      <section className="exec-center-filters">
        <label className="exec-center-search">
          <IconSearch />
          <input
            type="search"
            placeholder="Search checklists…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="exec-center-status-tools">
          <div className="exec-center-segments" role="tablist" aria-label="Status filter">
            {(
              [
                ["all", "All"],
                ["completed", "Completed"],
                ["open", "Open"],
                ["overdue", "Overdue"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                className={statusFilter === key ? "is-active" : undefined}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="exec-center-status-key">
            <button
              type="button"
              className="exec-center-status-key-btn"
              aria-label="Status key"
              aria-expanded={statusKeyOpen}
              aria-controls="exec-center-status-key-panel"
              onClick={() => setStatusKeyOpen((open) => !open)}
            >
              i
            </button>
            {statusKeyOpen ? (
              <div
                id="exec-center-status-key-panel"
                className="exec-center-status-key-panel"
                role="note"
              >
                <div className="exec-center-status-key-head">
                  <strong>Status key</strong>
                  <button
                    type="button"
                    className="exec-center-status-key-close"
                    aria-label="Close status key"
                    onClick={() => setStatusKeyOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <ul>
                  {STATUS_KEY.map((item) => (
                    <li key={item.status}>
                      <span className={`exec-center-badge ${statusClass(item.status)}`}>
                        {item.label}
                      </span>
                      <em>{item.detail}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
        <label className="exec-center-select">
          <span>Location</span>
          <select value={teamId} disabled>
            <option value={teamId}>{teamName}</option>
          </select>
        </label>
        <label className="exec-center-select">
          <span>Shift</span>
          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as ShiftFilter)}
          >
            <option value="all">All</option>
            {DAYPARTS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="exec-center-export" onClick={exportCsv}>
          <IconExport />
          Export
        </button>
      </section>

      <section className="exec-center-table-card">
        <div className="exec-center-table-scroll">
          <table className="exec-center-table">
            <thead>
              <tr>
                <th className="exec-center-col-check" aria-label="Select" />
                <th>Time</th>
                <th>Checklist</th>
                <th>Status</th>
                <th>Completion</th>
                <th>Corrective Actions</th>
                <th>Results</th>
                <th>User</th>
                <th>Comments</th>
                <th className="exec-center-col-more" aria-label="More" />
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr>
                  <td colSpan={10} className="exec-center-empty">
                    No checklists match these filters for today.
                  </td>
                </tr>
              ) : (
                grouped.map((group) => {
                  const open = !collapsed[group.key];
                  return (
                    <FragmentGroup
                      key={group.key}
                      groupKey={group.key}
                      label={group.label}
                      rangeLabel={group.rangeLabel}
                      count={filtered.filter((r) => r.daypart === group.key).length}
                      open={open}
                      onToggle={() => toggleGroup(group.key)}
                      rows={group.rows}
                      selected={selected}
                      onToggleRow={toggleRow}
                      onOpenChecklist={openChecklistRow}
                      onOpenWalk={(templateId) => navigate(`/go/temp-checks/walks/${templateId}`)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {resultsRow && teamId ? (
          <ExecCenterResultsModal
            teamId={teamId}
            occurrence={resultsRow.occurrence}
            statusLabel={resultsRow.statusLabel}
            onClose={() => setResultsRow(null)}
          />
        ) : null}
        {completeRow && teamId ? (
          <ExecCenterCompleteModal
            teamId={teamId}
            occurrence={completeRow.occurrence}
            onClose={() => setCompleteRow(null)}
            onCompleted={() => {
              void load();
            }}
          />
        ) : null}
        <footer className="exec-center-pager">
          <span>
            Showing {showingFrom}–{showingTo} of {filtered.length} checklists
          </span>
          <div className="exec-center-pager-controls">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              {pageSafe} / {totalPages}
            </span>
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function FragmentGroup({
  groupKey,
  label,
  rangeLabel,
  count,
  open,
  onToggle,
  rows,
  selected,
  onToggleRow,
  onOpenChecklist,
  onOpenWalk,
}: {
  groupKey: string;
  label: string;
  rangeLabel: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  rows: DashboardRow[];
  selected: Record<string, boolean>;
  onToggleRow: (id: string) => void;
  onOpenChecklist: (row: DashboardRow) => void;
  onOpenWalk: (templateId: string) => void;
}) {
  return (
    <>
      <tr className="exec-center-group" data-group={groupKey}>
        <td colSpan={10}>
          <button type="button" className="exec-center-group-btn" onClick={onToggle}>
            <IconChevron open={open} />
            <strong>
              {label} ({count})
            </strong>
            <span>{rangeLabel}</span>
          </button>
        </td>
      </tr>
      {open
        ? rows.map((row) => (
            <tr key={row.occurrence.id} className="exec-center-row">
              <td className="exec-center-col-check">
                <input
                  type="checkbox"
                  checked={Boolean(selected[row.occurrence.id])}
                  onChange={() => onToggleRow(row.occurrence.id)}
                  aria-label={`Select ${row.occurrence.template?.name ?? "checklist"}`}
                />
              </td>
              <td className="exec-center-time">{formatTime(row.occurrence.dueAt)}</td>
              <td>
                <button
                  type="button"
                  className="exec-center-checklist"
                  onClick={() => onOpenChecklist(row)}
                >
                  <span className="exec-center-checklist-ico" aria-hidden>
                    <IconChecklist />
                  </span>
                  <span>{row.occurrence.template?.name ?? "Checklist"}</span>
                </button>
              </td>
              <td>
                <span className={`exec-center-badge ${statusClass(row.status)}`}>{row.statusLabel}</span>
              </td>
              <td>
                <div className="exec-center-completion">
                  <div className={`exec-center-bar ${barClass(row.completionPct, row.status)}`}>
                    <span style={{ width: `${Math.max(row.completionPct, row.completionPct === 0 ? 0 : 4)}%` }} />
                  </div>
                  <em>{row.completionPct}%</em>
                </div>
              </td>
              <td>
                {row.openCa > 0 ? (
                  <span className="exec-center-ca">
                    <span className="exec-center-ca-dot" aria-hidden />
                    {row.openCa}
                  </span>
                ) : (
                  <span className="exec-center-muted">—</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="exec-center-icon-btn"
                  aria-label={row.status === "complete" ? "View results" : "Complete checklist"}
                  onClick={() => onOpenChecklist(row)}
                >
                  <IconResults />
                </button>
              </td>
              <td>
                {row.userName ? (
                  <span className="exec-center-user">
                    <span className="exec-center-user-avatar" aria-hidden>
                      {initials(row.userName)}
                    </span>
                    {row.userName}
                  </span>
                ) : (
                  <span className="exec-center-muted">—</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="exec-center-icon-btn"
                  disabled={!row.hasNotes && row.status !== "complete"}
                  aria-label="Comments"
                  title={row.hasNotes ? "Has notes" : "No comments"}
                  onClick={() => onOpenChecklist(row)}
                >
                  <IconComment />
                </button>
              </td>
              <td className="exec-center-col-more">
                <button
                  type="button"
                  className="exec-center-icon-btn"
                  aria-label="Open checklist settings"
                  onClick={() => onOpenWalk(row.occurrence.templateId)}
                >
                  <IconMore />
                </button>
              </td>
            </tr>
          ))
        : null}
    </>
  );
}
