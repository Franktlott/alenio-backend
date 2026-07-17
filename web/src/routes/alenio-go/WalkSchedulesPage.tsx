import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchWalkTemplates } from "../../lib/walks/api";
import {
  createWalkSchedule,
  fetchWalkOccurrences,
  fetchWalkSchedules,
} from "../../lib/walks/library-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function WalkSchedulesPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const [schedules, setSchedules] = useState<unknown[]>([]);
  const [occurrences, setOccurrences] = useState<unknown[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; status: string }>>(
    [],
  );
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!teamId) return;
    setLoading(true);
    try {
      const [s, o, t] = await Promise.all([
        fetchWalkSchedules(teamId),
        fetchWalkOccurrences(teamId),
        fetchWalkTemplates(teamId),
      ]);
      setSchedules(s);
      setOccurrences(o);
      setTemplates(t.filter((x) => x.status === "PUBLISHED"));
      if (!templateId && t[0]) setTemplateId(t.find((x) => x.status === "PUBLISHED")?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage || !teamId) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, teamId]);

  if (!canManage || !teamId) return <p className="enterprise-muted">Managers only.</p>;

  return (
    <div style={{ padding: "1rem 1.25rem" }}>
      <p className="wb-topbar-kicker">Alenio Walks</p>
      <h1>Walk schedules</h1>
      <p className="enterprise-muted">
        Multiple windows per day become separate occurrences.{" "}
        <Link to="/go/walks/builder">Builder</Link>
      </p>
      {error ? <p className="wb-error">{error}</p> : null}
      {loading ? <EnterprisePageLoading label="Loading schedules…" /> : null}

      <section style={{ margin: "1rem 0", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Published walk…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wb-btn wb-btn--primary"
          disabled={!templateId}
          onClick={() =>
            void createWalkSchedule(teamId, {
              templateId,
              name: "Daily cooler checks",
              recurrence: "DAILY",
              windows: [
                { startMinutes: 6 * 60, dueMinutes: 8 * 60, graceMinutes: 30 },
                { startMinutes: 13 * 60, dueMinutes: 15 * 60, graceMinutes: 30 },
                { startMinutes: 20 * 60, dueMinutes: 22 * 60, graceMinutes: 30 },
              ],
            }).then(() => reload())
          }
        >
          Create 3 daily windows (6–8, 13–15, 20–22)
        </button>
      </section>

      <h2>Schedules</h2>
      <ul>
        {(schedules as Array<Record<string, unknown>>).map((s) => (
          <li key={String(s.id)}>
            {String(s.name ?? "Schedule")} — {String(s.recurrence)} (
            {Array.isArray(s.windows) ? s.windows.length : 0} windows)
          </li>
        ))}
      </ul>

      <h2>Upcoming occurrences</h2>
      <ul className="go-kiosk-walks-list">
        {(occurrences as Array<Record<string, unknown>>).slice(0, 30).map((o) => (
          <li key={String(o.id)} className="go-kiosk-walks-card">
            <strong>{String(o.status)}</strong>
            <span>
              {o.windowStart ? new Date(String(o.windowStart)).toLocaleString() : ""} → due{" "}
              {o.dueAt ? new Date(String(o.dueAt)).toLocaleString() : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
