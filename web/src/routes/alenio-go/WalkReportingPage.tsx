import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchWalkReporting } from "../../lib/walks/library-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function WalkReportingPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canManage || !teamId) return;
    void fetchWalkReporting(teamId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [canManage, teamId]);

  if (!canManage) return <p className="enterprise-muted">Managers only.</p>;
  if (loading) return <EnterprisePageLoading label="Loading reporting…" />;

  const completion = (data?.completion as Record<string, unknown>) ?? {};
  const byItem = (data?.byItem as Array<Record<string, unknown>>) ?? [];
  const byPerson = (data?.byPerson as Array<Record<string, unknown>>) ?? [];
  const temps = (data?.temperatureTrends as Array<Record<string, unknown>>) ?? [];

  return (
    <div style={{ padding: "1rem 1.25rem" }}>
      <p className="wb-topbar-kicker">Alenio Walks</p>
      <h1>Walk reporting</h1>
      <p className="enterprise-muted">
        Cross-walk item analytics. <Link to="/go/walks/history">History</Link>
      </p>
      <section style={{ marginTop: "1.25rem" }}>
        <h2>Completions</h2>
        <ul>
          <li>Occurrences: {String(completion.occurrenceTotal ?? 0)}</li>
          <li>Completed: {String(completion.completed ?? 0)}</li>
          <li>On time: {String(completion.onTime ?? 0)}</li>
          <li>Late: {String(completion.late ?? 0)}</li>
          <li>Missed: {String(completion.missed ?? 0)}</li>
          <li>Runs completed: {String(completion.runsCompleted ?? 0)}</li>
        </ul>
      </section>
      <section>
        <h2>By item (library)</h2>
        <ul>
          {byItem.map((row) => (
            <li key={String(row.libraryItemId ?? row.title)}>
              {String(row.title)} — pass {String(row.pass)} / fail {String(row.failed)} / total{" "}
              {String(row.total)}
            </li>
          ))}
          {byItem.length === 0 ? <li>No item responses yet.</li> : null}
        </ul>
      </section>
      <section>
        <h2>By person</h2>
        <ul>
          {byPerson.map((row) => (
            <li key={String(row.userId)}>
              {String(row.userId)} — {String(row.completed)} completed
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Temperature readings</h2>
        <ul>
          {temps.slice(0, 40).map((t, i) => (
            <li key={i}>
              {String(t.title)}: {String(t.value)}° ({String(t.result)}) —{" "}
              {t.at ? new Date(String(t.at)).toLocaleString() : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
