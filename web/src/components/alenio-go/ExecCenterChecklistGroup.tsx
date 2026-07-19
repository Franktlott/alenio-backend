import type { DashboardRow, DaypartKey } from "../../lib/walks/exec-center-utils";
import {
  formatTime,
  initials,
  sortRowsForDisplay,
  statusBadgeLabel,
  statusClass,
  timingLabel,
} from "../../lib/walks/exec-center-utils";

type Props = {
  groupKey: DaypartKey;
  label: string;
  rangeLabel: string;
  count: number;
  doneCount: number;
  overdueCount?: number;
  open: boolean;
  onToggle: () => void;
  rows: DashboardRow[];
  onOpenChecklist: (row: DashboardRow) => void;
};

function DaypartIcon({ daypart }: { daypart: DaypartKey }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    "aria-hidden": true as const,
  };
  if (daypart === "breakfast") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" />
      </svg>
    );
  }
  if (daypart === "evening" || daypart === "overnight") {
    return (
      <svg {...common}>
        <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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

export function ExecCenterChecklistGroup({
  groupKey,
  label,
  rangeLabel,
  count,
  doneCount,
  overdueCount = 0,
  open,
  onToggle,
  rows,
  onOpenChecklist,
}: Props) {
  const overdueInGroup = overdueCount;
  const sortedRows = sortRowsForDisplay(rows);
  const allDone = doneCount === count && overdueInGroup === 0;

  return (
    <section
      className={`exec-center-daypart${overdueInGroup > 0 ? " exec-center-daypart--alert" : ""}${allDone ? " exec-center-daypart--done" : ""}`}
      data-group={groupKey}
    >
      <button type="button" className="exec-center-daypart-head" onClick={onToggle}>
        <IconChevron open={open} />
        <span className="exec-center-daypart-ico" aria-hidden>
          <DaypartIcon daypart={groupKey} />
        </span>
        <div className="exec-center-daypart-title">
          <strong>{label}</strong>
          <span className="exec-center-daypart-range">{rangeLabel}</span>
        </div>
        <span className="exec-center-daypart-score">
          {doneCount}/{count}
        </span>
        {overdueInGroup > 0 ? (
          <span className="exec-center-daypart-alert">{overdueInGroup} need action</span>
        ) : null}
      </button>

      {open ? (
        <div className="exec-center-check-list">
          {sortedRows.map((row) => (
            <button
              key={row.occurrence.id}
              type="button"
              className={`exec-center-check-card exec-center-check-card--${row.status}`}
              onClick={() => onOpenChecklist(row)}
            >
              <span className="exec-center-check-time">{formatTime(row.occurrence.dueAt)}</span>
              <span className="exec-center-check-main">
                <span className="exec-center-check-title-row">
                  <strong>{row.occurrence.template?.name ?? "Checklist"}</strong>
                  <span className={`exec-center-badge ${statusClass(row.status)}`}>
                    {statusBadgeLabel(row.status)}
                  </span>
                </span>
                <span className="exec-center-check-meta">
                  {timingLabel(row)}
                  {row.openCa > 0 ? ` · ${row.openCa} open CA` : ""}
                </span>
              </span>
              {row.userName ? (
                <span className="exec-center-user">
                  <span className="exec-center-user-avatar" aria-hidden>
                    {initials(row.userName)}
                  </span>
                </span>
              ) : (
                <span className="exec-center-user exec-center-user--empty" />
              )}
              <span className="exec-center-check-chevron" aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
