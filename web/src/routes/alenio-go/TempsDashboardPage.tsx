import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  ExecCenterChecklistGroup,
  ExecCenterTableHeader,
} from "../../components/alenio-go/ExecCenterChecklistGroup";
import { ExecCenterCompleteModal } from "../../components/alenio-go/ExecCenterCompleteModal";
import { ExecCenterResultsModal } from "../../components/alenio-go/ExecCenterResultsModal";
import { ExecCenterSummaryCards } from "../../components/alenio-go/ExecCenterSummaryCards";
import {
  fetchWalkOccurrences,
  fetchWalkReporting,
  fetchWalkRuns,
  type WalkOccurrenceRow,
  type WalkReportingSummary,
  type WalkRunListItem,
} from "../../lib/walks/library-api";
import {
  addDays,
  buildDashboardRow,
  DAYPARTS,
  daypartGroupPriority,
  deltaLabel,
  endOfLocalDay,
  formatDateChip,
  formatTime,
  formatUpdated,
  openActionsCount,
  PAGE_SIZE,
  rate,
  rowMatchesStatusFilter,
  sortRowsForDisplay,
  startOfLocalDay,
  startOfLocalWeek,
  statusCounts,
  type DashboardRow,
  type ShiftFilter,
  type StatusFilter,
} from "../../lib/walks/exec-center-utils";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

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

const STATUS_STRIP: Array<{
  key: Exclude<StatusFilter, "all">;
  label: string;
  detail: string;
  tone: string;
}> = [
  { key: "overdue", label: "Overdue", detail: "Past due and not completed", tone: "danger" },
  { key: "due_soon", label: "Due Soon", detail: "Due within the next 60 min", tone: "warn" },
  { key: "in_progress", label: "In Progress", detail: "Currently being completed", tone: "info" },
  { key: "completed", label: "Completed", detail: "Completed on time", tone: "success" },
  { key: "not_started", label: "Not Started", detail: "Not yet started", tone: "muted" },
];

const FILTER_SEGMENTS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "in_progress", label: "In Progress" },
  { key: "due_soon", label: "Due Soon" },
  { key: "overdue", label: "Overdue" },
  { key: "not_started", label: "Not Started" },
];

export function TempsDashboardPage() {
  const { teamId, teamName } = useAlenioGoShell();
  const listRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [occurrences, setOccurrences] = useState<WalkOccurrenceRow[]>([]);
  const [runs, setRuns] = useState<WalkRunListItem[]>([]);
  const [todayR, setTodayR] = useState<WalkReportingSummary | null>(null);
  const [yesterdayR, setYesterdayR] = useState<WalkReportingSummary | null>(null);
  const [dayBeforeR, setDayBeforeR] = useState<WalkReportingSummary | null>(null);
  const [weekR, setWeekR] = useState<WalkReportingSummary | null>(null);
  const [priorWeekR, setPriorWeekR] = useState<WalkReportingSummary | null>(null);
  const [days30R, setDays30R] = useState<WalkReportingSummary | null>(null);
  const [prior30R, setPrior30R] = useState<WalkReportingSummary | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseInitialized, setCollapseInitialized] = useState(false);
  const [page, setPage] = useState(1);
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

  function scrollToList() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const todayStart = startOfLocalDay(now);
      const todayEnd = endOfLocalDay(now);
      const tomorrowEnd = endOfLocalDay(addDays(now, 1));
      const yStart = startOfLocalDay(addDays(now, -1));
      const yEnd = endOfLocalDay(addDays(now, -1));
      const dbStart = startOfLocalDay(addDays(now, -2));
      const dbEnd = endOfLocalDay(addDays(now, -2));
      const weekStart = startOfLocalWeek(now);
      const priorWeekStart = addDays(weekStart, -7);
      const priorWeekEnd = endOfLocalDay(addDays(weekStart, -1));
      const days30Start = startOfLocalDay(addDays(now, -29));
      const prior30Start = startOfLocalDay(addDays(now, -59));
      const prior30End = endOfLocalDay(addDays(now, -30));

      const [occs, runList, today, yesterday, dayBefore, week, priorWeek, days30, prior30] =
        await Promise.all([
          fetchWalkOccurrences(teamId, {
            from: todayStart.toISOString(),
            to: tomorrowEnd.toISOString(),
          }),
          fetchWalkRuns(teamId),
          fetchWalkReporting(teamId, { from: todayStart.toISOString(), to: todayEnd.toISOString() }),
          fetchWalkReporting(teamId, { from: yStart.toISOString(), to: yEnd.toISOString() }),
          fetchWalkReporting(teamId, { from: dbStart.toISOString(), to: dbEnd.toISOString() }),
          fetchWalkReporting(teamId, { from: weekStart.toISOString(), to: todayEnd.toISOString() }),
          fetchWalkReporting(teamId, {
            from: priorWeekStart.toISOString(),
            to: priorWeekEnd.toISOString(),
          }),
          fetchWalkReporting(teamId, { from: days30Start.toISOString(), to: todayEnd.toISOString() }),
          fetchWalkReporting(teamId, {
            from: prior30Start.toISOString(),
            to: prior30End.toISOString(),
          }),
        ]);

      setOccurrences(occs);
      setRuns(runList);
      setTodayR(today);
      setYesterdayR(yesterday);
      setDayBeforeR(dayBefore);
      setWeekR(week);
      setPriorWeekR(priorWeek);
      setDays30R(days30);
      setPrior30R(prior30);
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

  const allRows = useMemo(() => {
    const now = new Date();
    return occurrences
      .map((occurrence) =>
        buildDashboardRow(
          occurrence,
          occurrence.runId ? runById.get(occurrence.runId) ?? null : null,
          now,
        ),
      )
      .sort(
        (a, b) =>
          new Date(a.occurrence.dueAt).getTime() - new Date(b.occurrence.dueAt).getTime(),
      );
  }, [occurrences, runById]);

  const todayRows = useMemo(
    () => allRows.filter((r) => r.dayKey === "today"),
    [allRows],
  );

  const counts = useMemo(() => statusCounts(todayRows), [todayRows]);
  const openActions = useMemo(() => openActionsCount(todayRows), [todayRows]);

  useEffect(() => {
    if (loading || collapseInitialized || todayRows.length === 0) return;
    const nextCollapsed: Record<string, boolean> = {};
    for (const part of DAYPARTS) {
      const partRows = todayRows.filter((r) => r.daypart === part.key);
      if (partRows.length === 0) continue;
      const done = partRows.filter((r) => r.status === "complete").length;
      const overdue = partRows.filter((r) => r.status === "overdue").length;
      nextCollapsed[part.key] = done === partRows.length && overdue === 0;
    }
    setCollapsed(nextCollapsed);
    setCollapseInitialized(true);
  }, [loading, collapseInitialized, todayRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todayRows.filter((row) => {
      if (shiftFilter !== "all" && row.daypart !== shiftFilter) return false;
      if (q) {
        const name = row.occurrence.template?.name ?? "";
        if (!name.toLowerCase().includes(q)) return false;
      }
      return rowMatchesStatusFilter(row, statusFilter);
    });
  }, [todayRows, search, statusFilter, shiftFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, shiftFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const grouped = useMemo(() => {
    return DAYPARTS.map((part) => {
      const partRows = filtered.filter((r) => r.daypart === part.key);
      return {
        ...part,
        rows: sortRowsForDisplay(pageRows.filter((r) => r.daypart === part.key)),
        allPartRows: partRows,
      };
    })
      .filter((g) => g.rows.length > 0)
      .sort((a, b) => {
        const pri = daypartGroupPriority(a.allPartRows) - daypartGroupPriority(b.allPartRows);
        if (pri !== 0) return pri;
        return DAYPARTS.findIndex((p) => p.key === a.key) - DAYPARTS.findIndex((p) => p.key === b.key);
      });
  }, [pageRows, filtered]);

  const todayRate = rate(todayR);
  const yesterdayRate = rate(yesterdayR);
  const dayBeforeRate = rate(dayBeforeR);
  const weekRate = rate(weekR);
  const priorWeekRate = rate(priorWeekR);
  const days30Rate = rate(days30R);
  const prior30Rate = rate(prior30R);

  function toggleGroup(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleStatusFilter(key: Exclude<StatusFilter, "all">) {
    setStatusFilter((prev) => (prev === key ? "all" : key));
    scrollToList();
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

  const countFor = (key: Exclude<StatusFilter, "all">) => {
    switch (key) {
      case "overdue":
        return counts.overdue;
      case "due_soon":
        return counts.due_soon;
      case "in_progress":
        return counts.in_progress;
      case "completed":
        return counts.completed;
      case "not_started":
        return counts.not_started;
    }
  };

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

      <ExecCenterSummaryCards
        todayRate={todayRate}
        yesterdayRate={yesterdayRate}
        weekRate={weekRate}
        days30Rate={days30Rate}
        priorWeekRate={priorWeekRate}
        prior30Rate={prior30Rate}
        dayBeforeYesterdayRate={dayBeforeRate}
        openActions={openActions}
        todayDelta={deltaLabel(todayRate, yesterdayRate)}
        yesterdayDelta={deltaLabel(yesterdayRate, dayBeforeRate)}
        weekDelta={deltaLabel(weekRate, priorWeekRate)}
        days30Delta={deltaLabel(days30Rate, prior30Rate)}
      />

      <section className="exec-center-status-strip" aria-label="Status overview">
        {STATUS_STRIP.map((item) => {
          const n = countFor(item.key);
          const active = statusFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`exec-center-status-card exec-center-status-card--${item.tone}${active ? " is-active" : ""}`}
              onClick={() => toggleStatusFilter(item.key)}
            >
              <strong>
                <em>{n}</em> {item.label}
              </strong>
              <span>{item.detail}</span>
            </button>
          );
        })}
      </section>

      <section className="exec-center-workspace" aria-label="Checklist filters and results">
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
          <div className="exec-center-segments" role="tablist" aria-label="Status filter">
            {FILTER_SEGMENTS.map(({ key, label }) => (
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
          <label className="exec-center-select">
            <span className="visually-hidden">Location</span>
            <select value={teamId} disabled aria-label="Location">
              <option value={teamId}>{teamName || "All Locations"}</option>
            </select>
          </label>
          <label className="exec-center-select">
            <span className="visually-hidden">Shift</span>
            <select
              value={shiftFilter}
              aria-label="Shift"
              onChange={(e) => setShiftFilter(e.target.value as ShiftFilter)}
            >
              <option value="all">Shift: All</option>
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

        <section className="exec-center-board" ref={listRef}>
          <div className="exec-center-board-scroll">
            {grouped.length === 0 ? (
              <div className="exec-center-empty-card">
                No checklists match these filters for today.
              </div>
            ) : (
              <div className="exec-center-table-shell">
                <ExecCenterTableHeader />
                {grouped.map((group) => {
                  const open = !collapsed[group.key];
                  return (
                    <ExecCenterChecklistGroup
                      key={group.key}
                      groupKey={group.key}
                      label={group.label}
                      rangeLabel={group.rangeLabel}
                      count={group.allPartRows.length}
                      open={open}
                      onToggle={() => toggleGroup(group.key)}
                      rows={group.rows}
                      allPartRows={group.allPartRows}
                      onOpenChecklist={openChecklistRow}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <footer className="exec-center-pager">
            <span>
              Showing {showingFrom}–{showingTo} of {filtered.length} checklists
            </span>
            <div className="exec-center-pager-controls">
              <button
                type="button"
                disabled={pageSafe <= 1}
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <span className="exec-center-pager-page">{pageSafe}</span>
              <button
                type="button"
                disabled={pageSafe >= totalPages}
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          </footer>
        </section>
      </section>

      {resultsRow && teamId ? (
        <ExecCenterResultsModal
          teamId={teamId}
          occurrence={resultsRow.occurrence}
          statusLabel={resultsRow.statusLabel}
          onClose={() => setResultsRow(null)}
          onUpdated={() => {
            void load();
          }}
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
    </div>
  );
}
