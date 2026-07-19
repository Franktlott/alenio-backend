import { useCallback, useEffect, useState } from "react";
import { TempsPageHeader } from "../../components/temps/TempsPageHeader";
import { TempsPageShell } from "../../components/temps/TempsPageShell";
import {
  fetchWalkReporting,
  type WalkReportingSummary,
} from "../../lib/walks/library-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function TempsReportsPage() {
  const { teamId } = useAlenioGoShell();
  const [summary, setSummary] = useState<WalkReportingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWalkReporting(teamId);
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const c = summary?.completion;

  return (
    <TempsPageShell wide testId="temps-reports-page">
      <TempsPageHeader
        title="Reports"
        description="Last 30 days of temperature checklist completion, misses, and open corrective actions."
        actions={
          <button type="button" className="temps-btn temps-btn--ghost" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      {loading ? <p className="temps-muted">Loading reports…</p> : null}
      {error ? <p className="temps-error">{error}</p> : null}

      {!loading && summary && c ? (
        <>
          <section className="temps-reports-kpis" aria-label="Completion summary">
            <article className="temps-reports-kpi">
              <strong>{pct(c.completionRate)}</strong>
              <span>Completion rate</span>
              <em>
                {c.completed} of {c.occurrenceTotal} checklists
              </em>
            </article>
            <article className="temps-reports-kpi">
              <strong>{pct(c.onTimeRate)}</strong>
              <span>On-time rate</span>
              <em>
                {c.onTime} on time · {c.late} late
              </em>
            </article>
            <article className="temps-reports-kpi temps-reports-kpi--warn">
              <strong>{c.missed}</strong>
              <span>Missed</span>
              <em>Past grace with no completion</em>
            </article>
            <article className="temps-reports-kpi temps-reports-kpi--danger">
              <strong>{summary.openCorrectiveActions}</strong>
              <span>Open CAs</span>
              <em>Pending corrective actions</em>
            </article>
          </section>

          <section className="temps-reports-panel">
            <header>
              <h2>By item</h2>
              <p>Highest fail rates first</p>
            </header>
            {summary.byItem.length === 0 ? (
              <p className="temps-muted">No item results in this range.</p>
            ) : (
              <table className="temps-reports-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Type</th>
                    <th>Checks</th>
                    <th>Fail rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.byItem]
                    .sort((a, b) => b.failRate - a.failRate)
                    .slice(0, 12)
                    .map((row) => (
                      <tr key={`${row.libraryItemId ?? row.title}-${row.type}`}>
                        <td>{row.title}</td>
                        <td>{row.type.replace(/_/g, " ")}</td>
                        <td>{row.total}</td>
                        <td>{pct(row.failRate)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="temps-reports-panel">
            <header>
              <h2>By person</h2>
              <p>Completed runs in range</p>
            </header>
            {summary.byPerson.length === 0 ? (
              <p className="temps-muted">No completions attributed yet.</p>
            ) : (
              <ul className="temps-reports-people">
                {summary.byPerson.slice(0, 10).map((person) => (
                  <li key={person.userId ?? person.name}>
                    <strong>{person.name}</strong>
                    <span>{person.completed} completed</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </TempsPageShell>
  );
}
