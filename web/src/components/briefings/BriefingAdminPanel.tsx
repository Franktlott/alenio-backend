import type { BriefingAdminStats } from "../../lib/api";
import { formatBriefingDate } from "../../lib/briefings-display";
import { BriefingStatusBadge } from "./BriefingStatusBadge";

type Props = {
  stats: BriefingAdminStats;
  busyKey?: string | null;
  onReset: (completionId: string) => Promise<void>;
};

export function BriefingAdminPanel({ stats, busyKey, onReset }: Props) {
  const rows = [...stats.users, ...stats.kioskCompletions];

  return (
    <div className="briefing-admin">
      <div className="briefing-admin-stats">
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value">{stats.totalAssigned}</span>
          <span className="briefing-admin-stat-label">Assigned</span>
        </div>
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value briefing-admin-stat-value--green">{stats.reviewed}</span>
          <span className="briefing-admin-stat-label">Reviewed</span>
        </div>
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value">{stats.pending}</span>
          <span className="briefing-admin-stat-label">Pending</span>
        </div>
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value briefing-admin-stat-value--amber">{stats.overdue}</span>
          <span className="briefing-admin-stat-label">Overdue</span>
        </div>
        <div className="briefing-admin-stat">
          <span className="briefing-admin-stat-value">{stats.completionPct}%</span>
          <span className="briefing-admin-stat-label">Completion</span>
        </div>
      </div>

      <div className="briefing-admin-table-wrap">
        <table className="briefing-admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Completed</th>
              <th>Initials</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.source === "account" ? row.userId! : `kiosk-${row.completedAt}-${row.initials}`;
              const completionId = row.completionId;
              return (
                <tr key={key}>
                  <td>
                    <strong>{row.name}</strong>
                    {row.email ? <span className="briefing-admin-email">{row.email}</span> : null}
                    {row.source === "kiosk" ? <span className="briefing-admin-tag">Alenio Go</span> : null}
                  </td>
                  <td>
                    <BriefingStatusBadge status={row.status} />
                  </td>
                  <td>{row.completedAt ? formatBriefingDate(row.completedAt) : "—"}</td>
                  <td>{row.initials ?? "—"}</td>
                  <td>
                    {completionId && row.status === "reviewed" ? (
                      <button
                        type="button"
                        className="briefing-admin-reset"
                        disabled={busyKey === completionId}
                        onClick={() => void onReset(completionId)}
                      >
                        Reset
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
