import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { ExecCenterChecklistGroup } from "../../components/alenio-go/ExecCenterChecklistGroup";
import { ExecCenterCompleteModal } from "../../components/alenio-go/ExecCenterCompleteModal";
import { ExecCenterOpsPanels } from "../../components/alenio-go/ExecCenterOpsPanels";
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
  deriveAtRiskItems,
  deriveRecentActivity,
  endOfLocalDay,
  formatDateChip,
  formatTime,
  formatUpdated,
  nextCheckRow,
  PAGE_SIZE,
  rate,
  sortRowsForDisplay,
  startOfLocalDay,
  STATUS_KEY,
  statusClass,
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseInitialized, setCollapseInitialized] = useState(false);
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

      const [occs, runList, today, yesterday] = await Promise.all([
        fetchWalkOccurrences(teamId, {
          from: todayStart.toISOString(),
          to: tomorrowEnd.toISOString(),
        }),
        fetchWalkRuns(teamId),
        fetchWalkReporting(teamId, { from: todayStart.toISOString(), to: todayEnd.toISOString() }),
        fetchWalkReporting(teamId, { from: yStart.toISOString(), to: yEnd.toISOString() }),
      ]);

      setOccurrences(occs);
      setRuns(runList);
      setTodayR(today);
      setYesterdayR(yesterday);
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

  const overdueLive = useMemo(
    () => todayRows.filter((r) => r.status === "overdue").length,
    [todayRows],
  );

  useEffect(() => {
    if (loading || collapseInitialized || todayRows.length === 0) return;
    if (overdueLive > 0) setStatusFilter("overdue");
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
  }, [loading, collapseInitialized, todayRows, overdueLive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todayRows.filter((row) => {
      if (shiftFilter !== "all" && row.daypart !== shiftFilter) return false;
      if (q) {
        const name = row.occurrence.template?.name ?? "";
        if (!name.toLowerCase().includes(q)) return false;
      }
      switch (statusFilter) {
        case "completed":
          return row.status === "complete";
        case "open":
          return row.status === "open" || row.status === "not_started";
        case "overdue":
          return row.status === "overdue";
        default:
          return true;
      }
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
  const todayDelta = deltaLabel(todayRate, yesterdayRate);
  const todayCompleted = todayR?.completion.completed ?? todayRows.filter((r) => r.status === "complete").length;
  const todayTotal = todayR?.completion.occurrenceTotal ?? todayRows.length;
  const completeLive = useMemo(
    () => todayRows.filter((r) => r.status === "complete").length,
    [todayRows],
  );
  const nextCheck = useMemo(() => nextCheckRow(todayRows), [todayRows]);
  const upcoming = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (r.dayKey === "today" || r.dayKey === "tomorrow") &&
          (r.status === "not_started" || r.status === "open"),
      ),
    [allRows],
  );
  const atRisk = useMemo(() => deriveAtRiskItems(todayRows), [todayRows]);
  const activity = useMemo(() => deriveRecentActivity(todayRows), [todayRows]);

  function openByOccurrenceId(occurrenceId: string) {
    const row = todayRows.find((r) => r.occurrence.id === occurrenceId);
    if (row) openChecklistRow(row);
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
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

  const vsYesterdayTone =
    todayDelta.up == null ? "even" : todayDelta.up ? "up" : "down";
  const vsYesterdayLabel =
    todayDelta.up == null
      ? "Even with yesterday"
      : `${todayDelta.up ? "▲" : "▼"} ${todayDelta.text} vs yesterday`;

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
          <p>
            {overdueLive > 0
              ? `${overdueLive} overdue · ${completeLive} complete · ${todayTotal} scheduled today`
              : `${completeLive} of ${todayTotal} complete today`}
          </p>
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
        overdueCount={overdueLive}
        completeCount={completeLive}
        nextCheck={nextCheck}
        todayRate={todayRate}
        todayCompleted={todayCompleted}
        todayTotal={todayTotal}
        vsYesterdayLabel={vsYesterdayLabel}
        vsYesterdayTone={vsYesterdayTone}
        onFilterOverdue={() => {
          setStatusFilter("overdue");
          scrollToList();
        }}
        onFilterComplete={() => {
          setStatusFilter("completed");
          scrollToList();
        }}
        onOpenNext={() => {
          if (nextCheck) openChecklistRow(nextCheck);
        }}
      />

      <section className="exec-center-body">
        <div className="exec-center-main">
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
                {key === "overdue" && overdueLive > 0 ? (
                  <span className="exec-center-segment-count">{overdueLive}</span>
                ) : null}
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

          {overdueLive > 0 && statusFilter !== "overdue" ? (
            <div className="exec-center-alert">
              <strong>{overdueLive} checklist{overdueLive === 1 ? "" : "s"} overdue</strong>
              <span>Review missed windows and assign follow-up.</span>
              <button type="button" onClick={() => setStatusFilter("overdue")}>
                Show overdue
              </button>
            </div>
          ) : null}

          <section className="exec-center-board" ref={listRef}>
        <div className="exec-center-board-scroll">
          {grouped.length === 0 ? (
            <div className="exec-center-empty-card">
              No checklists match these filters for today.
            </div>
          ) : (
            grouped.map((group) => {
              const open = !collapsed[group.key];
              const partDone = group.allPartRows.filter((r) => r.status === "complete").length;
              const partOverdue = group.allPartRows.filter((r) => r.status === "overdue").length;
              return (
                <ExecCenterChecklistGroup
                  key={group.key}
                  groupKey={group.key}
                  label={group.label}
                  rangeLabel={group.rangeLabel}
                  count={group.allPartRows.length}
                  doneCount={partDone}
                  overdueCount={partOverdue}
                  open={open}
                  onToggle={() => toggleGroup(group.key)}
                  rows={group.rows}
                  onOpenChecklist={openChecklistRow}
                />
              );
            })
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

        <ExecCenterOpsPanels
          upcoming={upcoming}
          atRisk={atRisk}
          activity={activity}
          onOpenUpcoming={openChecklistRow}
          onOpenAtRisk={openByOccurrenceId}
          onViewSchedule={() => {
            setStatusFilter("all");
            scrollToList();
          }}
          onViewOverdue={() => {
            setStatusFilter("overdue");
            scrollToList();
          }}
          onViewComplete={() => {
            setStatusFilter("completed");
            scrollToList();
          }}
        />
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
