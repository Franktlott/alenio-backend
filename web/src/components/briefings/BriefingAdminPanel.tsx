import type { BriefingAdminStats } from "../../lib/api";
import { formatBriefingDate } from "../../lib/briefings-display";

type Props = {
  stats: BriefingAdminStats;
  busyKey?: string | null;
  onReset: (completionId: string) => Promise<void>;
};

export function BriefingAdminPanel({ stats, busyKey, onReset }: Props) {
  return (
    <div className="briefing-admin">
      <div className="briefing-admin-stats">
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value briefing-admin-stat-value--green">{stats.signed}</span>
          <span className="briefing-admin-stat-label">Signed</span>
        </div>
        {stats.overdue ? (
          <div className="briefing-admin-stat">
            <span className="briefing-admin-stat-value briefing-admin-stat-value--amber">Overdue</span>
            <span className="briefing-admin-stat-label">Due date</span>
          </div>
        ) : null}
      </div>

      {stats.completions.length === 0 ? (
        <p className="enterprise-muted">No one has signed this briefing yet.</p>
      ) : (
        <div className="briefing-admin-table-wrap">
          <table className="briefing-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Completed</th>
                <th>Initials</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stats.completions.map((row) => (
                <tr key={row.completionId}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{formatBriefingDate(row.completedAt)}</td>
                  <td>{row.initials}</td>
                  <td>
                    <span className="briefing-admin-tag">{row.source === "kiosk" ? "Alenio Go" : "Web"}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="briefing-admin-reset"
                      disabled={busyKey === row.completionId}
                      onClick={() => void onReset(row.completionId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
