import type {
  ActivityItem,
  AtRiskItem,
  DashboardRow,
} from "../../lib/walks/exec-center-utils";
import {
  formatRelativeTime,
  formatTime,
  initials,
} from "../../lib/walks/exec-center-utils";

type Props = {
  upcoming: DashboardRow[];
  atRisk: AtRiskItem[];
  activity: ActivityItem[];
  onOpenUpcoming: (row: DashboardRow) => void;
  onOpenAtRisk: (occurrenceId: string) => void;
  onViewSchedule: () => void;
  onViewOverdue: () => void;
  onViewComplete: () => void;
};

export function ExecCenterOpsPanels({
  upcoming,
  atRisk,
  activity,
  onOpenUpcoming,
  onOpenAtRisk,
  onViewSchedule,
  onViewOverdue,
  onViewComplete,
}: Props) {
  return (
    <aside className="exec-center-sidebar" aria-label="Operations">
      <article className="exec-center-ops-card exec-center-ops-card--risk">
        <header className="exec-center-ops-head">
          <h3>Needs action</h3>
          {atRisk.length > 0 ? (
            <span className="exec-center-ops-badge">{atRisk.length}</span>
          ) : null}
        </header>
        {atRisk.length === 0 ? (
          <p className="exec-center-ops-empty">All clear for today.</p>
        ) : (
          <ul className="exec-center-ops-list exec-center-ops-list--risk">
            {atRisk.slice(0, 6).map((item) => (
              <li key={item.id}>
                {item.occurrenceId ? (
                  <button type="button" onClick={() => onOpenAtRisk(item.occurrenceId!)}>
                    <strong>{item.title}</strong>
                    <span className={item.tone === "danger" ? "is-down" : undefined}>
                      {item.detail}
                    </span>
                  </button>
                ) : (
                  <>
                    <strong>{item.title}</strong>
                    <span className={item.tone === "danger" ? "is-down" : undefined}>
                      {item.detail}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="exec-center-ops-link" onClick={onViewOverdue}>
          View overdue
        </button>
      </article>

      <article className="exec-center-ops-card">
        <header className="exec-center-ops-head">
          <h3>Upcoming</h3>
        </header>
        {upcoming.length === 0 ? (
          <p className="exec-center-ops-empty">No upcoming checks.</p>
        ) : (
          <ul className="exec-center-ops-list">
            {upcoming.slice(0, 5).map((row) => (
              <li key={row.occurrence.id}>
                <button type="button" onClick={() => onOpenUpcoming(row)}>
                  <strong>{formatTime(row.occurrence.dueAt)}</strong>
                  <span>{row.occurrence.template?.name ?? "Checklist"}</span>
                  <em>{row.dayKey === "tomorrow" ? "Tomorrow" : "Today"}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="exec-center-ops-link" onClick={onViewSchedule}>
          Full schedule
        </button>
      </article>

      <article className="exec-center-ops-card">
        <header className="exec-center-ops-head">
          <h3>Recent activity</h3>
        </header>
        {activity.length === 0 ? (
          <p className="exec-center-ops-empty">No completions yet today.</p>
        ) : (
          <ul className="exec-center-ops-list exec-center-ops-list--activity">
            {activity.slice(0, 5).map((item) => (
              <li key={item.id}>
                <span className="exec-center-user-avatar" aria-hidden>
                  {initials(item.userName)}
                </span>
                <div>
                  <strong>
                    {item.userName} completed {item.checklistName}
                  </strong>
                  <em>{formatRelativeTime(item.at)}</em>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="exec-center-ops-link" onClick={onViewComplete}>
          All completed
        </button>
      </article>
    </aside>
  );
}
