import { useQuery } from "@tanstack/react-query";
import { fetchChecklistLocationSubmissions, type ChecklistLocationRow } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";

type Props = {
  teamId: string;
  location: ChecklistLocationRow;
  filter: "today" | "7d" | "30d";
  onFilterChange: (filter: "today" | "7d" | "30d") => void;
  onClose: () => void;
};

function sinceForFilter(filter: Props["filter"]): string | undefined {
  const d = new Date();
  if (filter === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (filter === "7d") {
    d.setDate(d.getDate() - 7);
  } else {
    d.setDate(d.getDate() - 30);
  }
  return d.toISOString();
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LocationChecklistHistoryPanel({ teamId, location, filter, onFilterChange, onClose }: Props) {
  const since = sinceForFilter(filter);
  const submissionsQuery = useQuery({
    queryKey: queryKeys.checklistSubmissions(teamId, location.id, filter),
    queryFn: () => fetchChecklistLocationSubmissions(teamId, location.id, { since, limit: 50 }),
    refetchInterval: 8000,
  });

  const rows = submissionsQuery.data?.data ?? [];

  return (
    <div className="enterprise-checklist-history-panel">
      <div className="enterprise-checklist-history-head">
        <div>
          <h3 className="enterprise-checklist-history-title">{location.name}</h3>
          <p className="enterprise-muted enterprise-checklist-history-sub">Submission history</p>
        </div>
        <button type="button" className="enterprise-inline-link" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="enterprise-checklist-history-filters">
        {(["today", "7d", "30d"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`enterprise-team-pill-btn${filter === f ? " enterprise-checklist-filter-on" : ""}`}
            onClick={() => onFilterChange(f)}
          >
            {f === "today" ? "Today" : f === "7d" ? "7 days" : "30 days"}
          </button>
        ))}
      </div>
      {submissionsQuery.isLoading ? (
        <p className="enterprise-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="enterprise-muted">No submissions in this period.</p>
      ) : (
        <ul className="enterprise-checklist-history-list">
          {rows.map((s) => (
            <li key={s.id} className="enterprise-checklist-history-row">
              <div>
                <strong>{formatWhen(s.submittedAt)}</strong>
                {s.submitterName ? <span className="enterprise-muted"> · {s.submitterName}</span> : null}
              </div>
              <span className={s.isComplete ? "enterprise-checklist-badge-complete" : "enterprise-checklist-badge-partial"}>
                {s.checkedCount}/{s.totalCount} {s.isComplete ? "Complete" : "Partial"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
