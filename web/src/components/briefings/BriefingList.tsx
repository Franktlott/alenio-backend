import { Link } from "react-router-dom";
import type { BriefingRow } from "../../lib/api";
import { formatBriefingDate } from "../../lib/briefings-display";
import { BriefingStatusBadge } from "./BriefingStatusBadge";

type Props = {
  briefings: BriefingRow[];
  canManage?: boolean;
  reviewBasePath: string;
  adminBasePath?: string;
  kiosk?: boolean;
};

export function BriefingList({ briefings, canManage, reviewBasePath, adminBasePath, kiosk }: Props) {
  if (briefings.length === 0) {
    return (
      <div className="briefing-list-empty">
        <p className="enterprise-muted">No briefings published yet.</p>
        {canManage ? <p className="enterprise-muted">Create a briefing to share documents with your floor team.</p> : null}
      </div>
    );
  }

  return (
    <ul className={`briefing-list${kiosk ? " briefing-list--kiosk" : ""}`}>
      {briefings.map((b) => (
        <li key={b.id} className="briefing-card">
          <div className="briefing-card-main">
            <div className="briefing-card-head">
              <h3 className="briefing-card-title">{b.title}</h3>
              <BriefingStatusBadge status={b.status} />
            </div>
            <p className="briefing-card-desc">{b.description}</p>
            <dl className="briefing-card-meta">
              <div>
                <dt>Published</dt>
                <dd>{formatBriefingDate(b.publishedAt)}</dd>
              </div>
              {b.dueAt ? (
                <div>
                  <dt>Due</dt>
                  <dd>{formatBriefingDate(b.dueAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="briefing-card-actions">
            <Link
              to={`${reviewBasePath}/${b.id}`}
              className="enterprise-alenio-go-link-btn briefing-card-btn"
            >
              {b.status === "reviewed" ? "View briefing" : "Review Briefing"}
            </Link>
            {canManage && adminBasePath ? (
              <Link to={`${adminBasePath}/${b.id}/admin`} className="briefing-card-admin-link">
                Tracking
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
