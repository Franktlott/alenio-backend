import { Link } from "react-router-dom";
import type { WalkTemplateRow } from "../../lib/api";
import { formatWalkDateTime } from "../../lib/walks-display";

type Props = {
  templates: WalkTemplateRow[];
  basePath: string;
};

export function GoKioskWalksList({ templates, basePath }: Props) {
  if (templates.length === 0) {
    return (
      <div className="go-kiosk-walks-empty">
        <p>No walks yet. Create a walk to start structured manager observations.</p>
        <Link to={`${basePath}/new`} className="go-kiosk-walks-create-btn">
          + Create Walk
        </Link>
      </div>
    );
  }

  return (
    <div className="go-kiosk-walks-list-wrap">
      <div className="go-kiosk-walks-list-head">
        <h2>Walk templates</h2>
        <Link to={`${basePath}/new`} className="go-kiosk-walks-create-btn">
          + Create Walk
        </Link>
      </div>
      <ul className="go-kiosk-walks-list">
        {templates.map((walk) => (
          <li key={walk.id}>
            <Link to={`${basePath}/${walk.id}/run`} className="go-kiosk-walks-card">
              <div>
                <strong>{walk.name}</strong>
                <span>{walk.workplace}</span>
              </div>
              <div className="go-kiosk-walks-card-meta">
                <span>{walk.itemCount} items</span>
                <span>{walk.completionCount} completed</span>
              </div>
              <span className="go-kiosk-walks-card-cta">Start walk →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type HistoryProps = {
  completions: Array<{
    id: string;
    walkName: string;
    workplace: string;
    completedByName: string;
    completedAt: string;
    needsAttentionCount: number;
  }>;
  basePath: string;
};

export function GoKioskWalksHistory({ completions, basePath }: HistoryProps) {
  if (completions.length === 0) {
    return <p className="enterprise-muted">No completed walks yet.</p>;
  }

  return (
    <ul className="go-kiosk-walks-history">
      {completions.map((row) => (
        <li key={row.id}>
          <Link to={`${basePath}/history/${row.id}`} className="go-kiosk-walks-history-item">
            <strong>{row.walkName}</strong>
            <span>{row.workplace}</span>
            <span>
              {formatWalkDateTime(row.completedAt)} · {row.completedByName}
            </span>
            {row.needsAttentionCount > 0 ? (
              <span className="go-kiosk-walks-history-flag">{row.needsAttentionCount} need attention</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
