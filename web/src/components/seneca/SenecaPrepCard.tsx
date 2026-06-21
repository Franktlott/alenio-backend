import { useEffect, useState } from "react";
import { fetchSenecaPrep, type SenecaPrep } from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer } from "./SenecaShared";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  templateId?: string;
  compact?: boolean;
};

function PrepSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="seneca-prep-section">
      <h4 className="seneca-prep-section-title">{title}</h4>
      <ul className="seneca-prep-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function SenecaPrepCard({ teamId, memberUserId, memberName, managerName, templateId, compact }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [prep, setPrep] = useState<SenecaPrep | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchSenecaPrep(teamId, memberUserId, { templateId, memberName, managerName })
      .then((res) => {
        if (!cancelled) setPrep(res.prep);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load Seneca prep.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, memberUserId, memberName, managerName, templateId]);

  return (
    <aside className="seneca-prep-card" aria-label="Seneca prep">
      <header className="seneca-prep-head">
        <div className="seneca-prep-head-row">
          <SenecaBrandMark />
          <span className="seneca-kicker">Prep</span>
        </div>
        {compact ? (
          <button type="button" className="seneca-prep-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "Show"} prep
          </button>
        ) : null}
      </header>

      {expanded ? (
        <div className="seneca-prep-body">
          <SenecaDisclaimer />
          {loading ? <p className="enterprise-muted seneca-prep-loading">Building your prep brief…</p> : null}
          {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
          {prep && !loading ? (
            <>
              {prep.lastCheckInNotes ? (
                <section className="seneca-prep-section">
                  <h4 className="seneca-prep-section-title">Last check-in notes</h4>
                  <p className="seneca-prep-notes">{prep.lastCheckInNotes}</p>
                </section>
              ) : null}
              <PrepSection title="Open development goals" items={prep.openDevelopmentGoals} />
              <PrepSection title="Open follow-up tasks" items={prep.openFollowUpTasks} />
              <PrepSection title="Recent wins" items={prep.recentWins} />
              {prep.completionPatterns ? (
                <section className="seneca-prep-section">
                  <h4 className="seneca-prep-section-title">Completion patterns</h4>
                  <p className="seneca-prep-notes">{prep.completionPatterns}</p>
                </section>
              ) : null}
              <PrepSection title="Suggested talking points" items={prep.suggestedTalkingPoints} />
              <PrepSection title="Suggested coaching questions" items={prep.suggestedCoachingQuestions} />
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
