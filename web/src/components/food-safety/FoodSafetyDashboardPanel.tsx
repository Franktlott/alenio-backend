import { Link } from "react-router-dom";
import type { FoodSafetyDashboard, HaccpDueStatus } from "../../lib/food-safety-api";
import { dueStatusPill } from "../../lib/food-safety-api";

type Props = {
  dashboard: FoodSafetyDashboard;
  basePath: string;
  onStartCheck?: (templateId: string, runId: string | null) => void;
  showTimeline?: boolean;
};

function statusClass(status: HaccpDueStatus): string {
  if (status === "due_now") return "fs-dash-card--due";
  if (status === "missed") return "fs-dash-card--missed";
  if (status === "completed") return "fs-dash-card--done";
  if (status === "in_progress") return "fs-dash-card--active";
  return "fs-dash-card--later";
}

function formatNextDue(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FoodSafetyDashboardPanel({ dashboard, basePath, onStartCheck, showTimeline = true }: Props) {
  const { stats, cards, timeline } = dashboard;

  return (
    <div className="fs-dash" data-testid="food-safety-dashboard">
      <section className="fs-dash-stats">
        <article className="fs-dash-stat fs-dash-stat--hero">
          <p className="fs-dash-stat-label">Today&apos;s completion</p>
          <p className="fs-dash-stat-value">{stats.completionPct}%</p>
        </article>
        <article className="fs-dash-stat">
          <p className="fs-dash-stat-label">Completed</p>
          <p className="fs-dash-stat-value">{stats.completedChecks}</p>
        </article>
        <article className="fs-dash-stat">
          <p className="fs-dash-stat-label">Missed</p>
          <p className="fs-dash-stat-value">{stats.missedChecks}</p>
        </article>
        <article className="fs-dash-stat">
          <p className="fs-dash-stat-label">Open actions</p>
          <p className="fs-dash-stat-value">{stats.openCorrectiveActions}</p>
        </article>
        <article className="fs-dash-stat">
          <p className="fs-dash-stat-label">Overdue</p>
          <p className="fs-dash-stat-value">{stats.overdueItems}</p>
        </article>
      </section>

      <section className="fs-dash-cards">
        <h2 className="fs-dash-section-title">What&apos;s due right now</h2>
        <div className="fs-dash-card-grid">
          {cards.tempChecks.map((card) => (
            <button
              key={card.templateId}
              type="button"
              className={`fs-dash-card ${statusClass(card.dueStatus)}`}
              onClick={() => onStartCheck?.(card.templateId, card.runId)}
            >
              <span className={`fs-dash-pill fs-dash-pill--${card.dueStatus}`}>{dueStatusPill(card.dueStatus)}</span>
              <strong className="fs-dash-card-title">{card.name}</strong>
              <span className="fs-dash-card-meta">{card.dueLabel}</span>
              <span className="fs-dash-card-foot">{card.itemCount} items</span>
            </button>
          ))}

          <Link to={`${basePath}/cooling`} className="fs-dash-card fs-dash-card--cooling">
            <span className="fs-dash-pill">Cooling logs</span>
            <strong className="fs-dash-card-title">Active cooling</strong>
            <span className="fs-dash-card-meta">{cards.coolingActive} active</span>
            <span className="fs-dash-card-foot">Track time &amp; temps</span>
          </Link>

          <Link to={`${basePath}/calibration`} className="fs-dash-card fs-dash-card--calibration">
            <span className="fs-dash-pill">Probe calibration</span>
            <strong className="fs-dash-card-title">Ice water check</strong>
            <span className="fs-dash-card-meta">Next due {formatNextDue(cards.probeCalibrationNextDue)}</span>
            <span className="fs-dash-card-foot">Target 32°F</span>
          </Link>

          <div className="fs-dash-card fs-dash-card--actions">
            <span className="fs-dash-pill">Corrective actions</span>
            <strong className="fs-dash-card-title">Open items</strong>
            <span className="fs-dash-card-meta">{cards.openCorrectiveActions} open</span>
            <span className="fs-dash-card-foot">Requires follow-up</span>
          </div>
        </div>
      </section>

      {showTimeline ? (
        <section className="fs-dash-timeline">
          <h2 className="fs-dash-section-title">Today&apos;s food safety timeline</h2>
          {timeline.length === 0 ? (
            <p className="enterprise-muted">No activity logged yet today.</p>
          ) : (
            <ul className="fs-dash-timeline-list">
              {timeline.map((event) => (
                <li key={event.id} className="fs-dash-timeline-item">
                  <span className="fs-dash-timeline-time">
                    {new Date(event.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="fs-dash-timeline-copy">
                    <p>{event.message}</p>
                    {event.actorName ? <span>{event.actorName}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
