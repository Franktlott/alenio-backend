import type { DashboardRow, DaypartKey } from "../../lib/walks/exec-center-utils";
import {
  daypartAlertBadge,
  formatTime,
  initials,
  progressToneClass,
  sortRowsForDisplay,
  statusBadgeLabel,
  statusClass,
} from "../../lib/walks/exec-center-utils";

type Props = {
  groupKey: DaypartKey;
  label: string;
  rangeLabel: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  rows: DashboardRow[];
  allPartRows: DashboardRow[];
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

function ChecklistIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
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

function IconResults() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ExecCenterTableHeader() {
  return (
    <div className="exec-center-table-head" role="row">
      <span>Time</span>
      <span>Checklist</span>
      <span>Status</span>
      <span>Progress</span>
      <span>Corrective Actions</span>
      <span>Results</span>
      <span>Assignee</span>
      <span>Comments</span>
      <span className="exec-center-col-more" aria-hidden />
    </div>
  );
}

export function ExecCenterChecklistGroup({
  groupKey,
  label,
  rangeLabel,
  count,
  open,
  onToggle,
  rows,
  allPartRows,
  onOpenChecklist,
}: Props) {
  const sortedRows = sortRowsForDisplay(rows);
  const alert = daypartAlertBadge(allPartRows);
  const allDone =
    allPartRows.length > 0 && allPartRows.every((r) => r.status === "complete");

  return (
    <section
      className={`exec-center-daypart${alert?.tone === "overdue" ? " exec-center-daypart--alert" : ""}${allDone ? " exec-center-daypart--done" : ""}`}
      data-group={groupKey}
    >
      <button type="button" className="exec-center-daypart-head" onClick={onToggle}>
        <IconChevron open={open} />
        <span className="exec-center-daypart-ico" aria-hidden>
          <DaypartIcon daypart={groupKey} />
        </span>
        <div className="exec-center-daypart-title">
          <strong>
            {label} <em>({count})</em>
          </strong>
          <span className="exec-center-daypart-range">{rangeLabel}</span>
        </div>
        {alert ? (
          <span className={`exec-center-daypart-alert exec-center-daypart-alert--${alert.tone}`}>
            {alert.text}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="exec-center-table exec-center-table--group">
          {sortedRows.map((row) => (
            <div
              key={row.occurrence.id}
              className={`exec-center-table-row exec-center-table-row--${row.status}`}
              role="row"
            >
              <span className="exec-center-col-time">{formatTime(row.occurrence.dueAt)}</span>
              <span className="exec-center-col-name">
                <span className="exec-center-check-ico" aria-hidden>
                  <ChecklistIcon />
                </span>
                <strong>{row.occurrence.template?.name ?? "Checklist"}</strong>
              </span>
              <span className="exec-center-col-status">
                <span className={`exec-center-badge ${statusClass(row.status)}`}>
                  {statusBadgeLabel(row.status)}
                </span>
              </span>
              <span className="exec-center-col-progress">
                <span className="exec-center-progress-pct">{row.completionPct}%</span>
                <span
                  className={`exec-center-progress-track ${progressToneClass(row.status)}`}
                  role="progressbar"
                  aria-valuenow={row.completionPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span
                    className="exec-center-progress-fill"
                    style={{ width: `${row.completionPct}%` }}
                  />
                </span>
              </span>
              <span className="exec-center-col-ca">
                {row.openCa > 0 ? (
                  <span
                    className={`exec-center-ca-pill${row.status === "overdue" ? " is-danger" : " is-warn"}`}
                  >
                    <span className="exec-center-ca-dot" aria-hidden />
                    {row.openCa}
                  </span>
                ) : (
                  <span className="exec-center-ca-empty">—</span>
                )}
              </span>
              <span className="exec-center-col-results">
                <button
                  type="button"
                  className="exec-center-icon-btn"
                  aria-label={row.status === "complete" ? "View results" : "Complete checklist"}
                  onClick={() => onOpenChecklist(row)}
                >
                  <IconResults />
                </button>
              </span>
              <span className="exec-center-col-assignee">
                {row.userName ? (
                  <>
                    <span className="exec-center-user-avatar" aria-hidden>
                      {initials(row.userName)}
                    </span>
                    <span className="exec-center-user-name">{row.userName}</span>
                  </>
                ) : (
                  <span className="exec-center-ca-empty">—</span>
                )}
              </span>
              <span className="exec-center-col-comments">
                <span className="exec-center-comments" aria-label="No comments">
                  <IconComment />
                  <span>—</span>
                </span>
              </span>
              <span className="exec-center-col-more">
                <button
                  type="button"
                  className="exec-center-icon-btn"
                  aria-label="More actions"
                  onClick={() => onOpenChecklist(row)}
                >
                  <IconMore />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
