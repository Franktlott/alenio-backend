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
  /** When provided, prep is loaded by the parent once for the whole check-in session. */
  prep?: SenecaPrep | null;
  loading?: boolean;
  err?: string | null;
  /** Template leader prep shown until prep response includes leaderPrepSteps. */
  templateLeaderPrep?: string[];
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

export function SenecaPrepCard({
  teamId,
  memberUserId,
  memberName,
  managerName,
  templateId,
  compact,
  prep: prepProp,
  loading: loadingProp,
  err: errProp,
  templateLeaderPrep = [],
}: Props) {
  const controlled = prepProp !== undefined || loadingProp !== undefined || errProp !== undefined;
  const [localPrep, setLocalPrep] = useState<SenecaPrep | null>(null);
  const [localLoading, setLocalLoading] = useState(!controlled);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  const prep = controlled ? (prepProp ?? null) : localPrep;
  const loading = controlled ? Boolean(loadingProp) : localLoading;
  const err = controlled ? (errProp ?? null) : localErr;
  const leaderPrepSteps =
    prep?.leaderPrepSteps?.length ? prep.leaderPrepSteps : templateLeaderPrep;

  useEffect(() => {
    if (controlled) return;

    let cancelled = false;
    setLocalLoading(true);
    setLocalErr(null);
    void fetchSenecaPrep(teamId, memberUserId, { templateId, memberName, managerName })
      .then((res) => {
        if (!cancelled) setLocalPrep(res.prep);
      })
      .catch((e) => {
        if (!cancelled) setLocalErr(e instanceof Error ? e.message : "Could not load Seneca prep.");
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controlled, teamId, memberUserId, memberName, managerName, templateId]);

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
          <PrepSection title="Leader prep" items={leaderPrepSteps} />
          {prep && !loading ? (
            <>
              {prep.lastCheckInInsights.length > 0 ? (
                <PrepSection title="Insights from last check-in" items={prep.lastCheckInInsights} />
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
