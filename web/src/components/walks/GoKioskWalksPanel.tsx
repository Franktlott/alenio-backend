import { Link } from "react-router-dom";
import type { WalkTemplateRow } from "../../lib/api";
import { formatWalkDateTime } from "../../lib/walks-display";

type Props = {
  templates: WalkTemplateRow[];
  completions: Array<{
    id: string;
    walkName: string;
    workplace: string;
    completedByName: string;
    completedAt: string;
    needsAttentionCount: number;
  }>;
  hubToken: string;
  tab: "walks" | "history";
  onTabChange: (tab: "walks" | "history") => void;
};

export function GoKioskWalksPanel({ templates, completions, hubToken, tab, onTabChange }: Props) {
  const base = `/checklist/${hubToken}/walks`;

  return (
    <div className="go-walks-kiosk-panel">
      <div className="go-walks-kiosk-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`go-walks-kiosk-tab${tab === "walks" ? " go-walks-kiosk-tab--active" : ""}`}
          aria-selected={tab === "walks"}
          onClick={() => onTabChange("walks")}
        >
          Walks ({templates.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`go-walks-kiosk-tab${tab === "history" ? " go-walks-kiosk-tab--active" : ""}`}
          aria-selected={tab === "history"}
          onClick={() => onTabChange("history")}
        >
          History ({completions.length})
        </button>
      </div>

      {tab === "walks" ? (
        <>
          <div className="go-walks-kiosk-actions">
            <Link to={`${base}/new`} className="go-walks-kiosk-create-btn">
              + Create walk
            </Link>
          </div>
          {templates.length === 0 ? (
            <p className="go-dash-loading">No walks yet. Create one to start structured observations.</p>
          ) : (
            <ul className="go-walks-kiosk-list">
              {templates.map((walk) => (
                <li key={walk.id}>
                  <Link to={`${base}/${walk.id}/run`} className="go-walks-kiosk-card">
                    <div>
                      <strong>{walk.name}</strong>
                      <span>{walk.workplace}</span>
                    </div>
                    <div className="go-walks-kiosk-card-meta">
                      <span>{walk.itemCount} items</span>
                      <span>{walk.completionCount} completed</span>
                    </div>
                    <span className="go-walks-kiosk-card-cta">Start walk →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : completions.length === 0 ? (
        <p className="go-dash-loading">No completed walks yet.</p>
      ) : (
        <ul className="go-walks-kiosk-list">
          {completions.map((row) => (
            <li key={row.id}>
              <Link to={`${base}/history/${row.id}`} className="go-walks-kiosk-card go-walks-kiosk-card--history">
                <div>
                  <strong>{row.walkName}</strong>
                  <span>{row.workplace}</span>
                </div>
                <div className="go-walks-kiosk-card-meta">
                  <span>{formatWalkDateTime(row.completedAt)}</span>
                  <span>{row.completedByName}</span>
                </div>
                {row.needsAttentionCount > 0 ? (
                  <span className="go-walks-kiosk-flag">{row.needsAttentionCount} need attention</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
