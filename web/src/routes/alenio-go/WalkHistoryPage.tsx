import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchWalkRuns } from "../../lib/walks/library-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function WalkHistoryPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage || !teamId) return;
    setLoading(true);
    void fetchWalkRuns(teamId)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [canManage, teamId]);

  if (!canManage) return <p className="enterprise-muted">Managers only.</p>;

  return (
    <div style={{ padding: "1rem 1.25rem" }}>
      <p className="wb-topbar-kicker">Alenio Walks</p>
      <h1>Walk history</h1>
      <p className="enterprise-muted">
        Past submissions (immutable snapshots). <Link to="/go/walks/reporting">Reporting</Link>
      </p>
      {error ? <p className="wb-error">{error}</p> : null}
      {loading ? <EnterprisePageLoading label="Loading runs…" /> : null}
      <ul className="go-kiosk-walks-list">
        {rows.map((r) => (
          <li key={String(r.id)} className="go-kiosk-walks-card">
            <strong>{String(r.templateName ?? "Walk")}</strong>
            <span>
              {String(r.status)} · score {String(r.score ?? "—")} ·{" "}
              {r.completedAt ? new Date(String(r.completedAt)).toLocaleString() : "in progress"}
            </span>
          </li>
        ))}
        {!loading && rows.length === 0 ? <li className="go-kiosk-walks-empty">No runs yet.</li> : null}
      </ul>
    </div>
  );
}
