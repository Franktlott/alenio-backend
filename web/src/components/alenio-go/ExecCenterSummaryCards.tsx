import type { DashboardRow } from "../../lib/walks/exec-center-utils";
import { formatTime } from "../../lib/walks/exec-center-utils";

type Props = {
  overdueCount: number;
  completeCount: number;
  nextCheck: DashboardRow | null;
  todayRate: number;
  todayCompleted: number;
  todayTotal: number;
  vsYesterdayLabel: string;
  vsYesterdayTone: "up" | "down" | "even";
  onFilterOverdue: () => void;
  onFilterComplete: () => void;
  onOpenNext: () => void;
};

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

export function ExecCenterSummaryCards({
  overdueCount,
  completeCount,
  nextCheck,
  todayRate,
  todayCompleted,
  todayTotal,
  vsYesterdayLabel,
  vsYesterdayTone,
  onFilterOverdue,
  onFilterComplete,
  onOpenNext,
}: Props) {
  return (
    <section className="exec-center-kpis" aria-label="Today summary">
      <button
        type="button"
        className={`exec-center-kpi-card exec-center-kpi-card--danger${overdueCount > 0 ? " is-hot" : ""}`}
        onClick={onFilterOverdue}
      >
        <span className="exec-center-kpi-ico" aria-hidden>
          <IconBell />
        </span>
        <span className="exec-center-kpi-value">{overdueCount}</span>
        <span className="exec-center-kpi-label">Overdue</span>
        <span className="exec-center-kpi-sub">
          {overdueCount === 1 ? "Checklist needs action" : "Checklists need action"}
        </span>
      </button>

      <button
        type="button"
        className="exec-center-kpi-card exec-center-kpi-card--success"
        onClick={onFilterComplete}
      >
        <span className="exec-center-kpi-ico" aria-hidden>
          <IconCheck />
        </span>
        <span className="exec-center-kpi-value">{completeCount}</span>
        <span className="exec-center-kpi-label">Complete</span>
        <span className="exec-center-kpi-sub">Today</span>
      </button>

      <button
        type="button"
        className="exec-center-kpi-card exec-center-kpi-card--warn"
        onClick={onOpenNext}
        disabled={!nextCheck}
      >
        <span className="exec-center-kpi-ico" aria-hidden>
          <IconClock />
        </span>
        <span className="exec-center-kpi-value exec-center-kpi-value--time">
          {nextCheck ? formatTime(nextCheck.occurrence.dueAt) : "—"}
        </span>
        <span className="exec-center-kpi-label">Next check</span>
        <span className="exec-center-kpi-sub">
          {nextCheck
            ? nextCheck.occurrence.template?.name ?? "Checklist"
            : "None left today"}
        </span>
      </button>

      <article className="exec-center-kpi-card exec-center-kpi-card--progress" aria-label="Today's progress">
        <span className="exec-center-kpi-ico" aria-hidden>
          <IconTrend />
        </span>
        <span className="exec-center-kpi-value">
          {todayRate}
          <em>%</em>
        </span>
        <span className="exec-center-kpi-label">Today&apos;s progress</span>
        <div
          className="exec-center-kpi-track"
          role="progressbar"
          aria-valuenow={todayRate}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="exec-center-kpi-fill" style={{ width: `${todayRate}%` }} />
        </div>
        <span className="exec-center-kpi-sub">
          {todayCompleted} of {todayTotal} checklists complete
          {vsYesterdayTone !== "even" ? (
            <>
              {" "}
              ·{" "}
              <span className={vsYesterdayTone === "up" ? "is-up" : "is-down"}>
                {vsYesterdayLabel}
              </span>
            </>
          ) : null}
        </span>
      </article>
    </section>
  );
}
