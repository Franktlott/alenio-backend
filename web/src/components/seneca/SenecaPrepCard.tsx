import { useState } from "react";
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
  /** When false, user must click to load AI prep. */
  prepRequested?: boolean;
  onRequestPrep?: () => void;
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

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildPrepSummary(prep: SenecaPrep): string {
  const bits: string[] = [];
  if (prep.lastCheckInInsights.length > 0) {
    bits.push(countLabel(prep.lastCheckInInsights.length, "insight"));
  }
  if (prep.suggestedTalkingPoints.length > 0) {
    bits.push(countLabel(prep.suggestedTalkingPoints.length, "talking point"));
  }
  if (prep.openDevelopmentGoals.length > 0) {
    bits.push(countLabel(prep.openDevelopmentGoals.length, "goal"));
  }
  if (prep.openFollowUpTasks.length > 0) {
    bits.push(countLabel(prep.openFollowUpTasks.length, "open task", "open tasks"));
  }
  if (prep.recentWins.length > 0) {
    bits.push(countLabel(prep.recentWins.length, "win"));
  }
  return bits.slice(0, 3).join(" · ") || "Highlights ready for your check-in";
}

function prepPreviewLine(prep: SenecaPrep): string | null {
  return (
    prep.suggestedTalkingPoints[0] ??
    prep.lastCheckInInsights[0] ??
    prep.openFollowUpTasks[0] ??
    null
  );
}

function IconPrepCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconPrepSpark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
    </svg>
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
  prepRequested: prepRequestedProp = false,
  onRequestPrep,
}: Props) {
  const controlled = prepProp !== undefined || loadingProp !== undefined || errProp !== undefined;
  const [localPrep, setLocalPrep] = useState<SenecaPrep | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [localPrepRequested, setLocalPrepRequested] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const prep = controlled ? (prepProp ?? null) : localPrep;
  const loading = controlled ? Boolean(loadingProp) : localLoading;
  const err = controlled ? (errProp ?? null) : localErr;
  const prepRequested = controlled ? prepRequestedProp : localPrepRequested;
  const leaderPrepSteps =
    prep?.leaderPrepSteps?.length ? prep.leaderPrepSteps : templateLeaderPrep;

  const loadPrep = () => {
    if (loading) return;
    if (onRequestPrep) {
      onRequestPrep();
      return;
    }

    setLocalPrepRequested(true);
    setLocalLoading(true);
    setLocalErr(null);
    void fetchSenecaPrep(teamId, memberUserId, { templateId, memberName, managerName })
      .then((res) => setLocalPrep(res.prep))
      .catch((e) => setLocalErr(e instanceof Error ? e.message : "Could not load Seneca prep."))
      .finally(() => setLocalLoading(false));
  };

  const showAiPrep = prepRequested || loading || prep || err;
  const isCompactCollapsed = Boolean(compact && !expanded);

  if (compact && isCompactCollapsed && loading) {
    return (
      <aside className="seneca-prep-card seneca-prep-card--compact" aria-label="Seneca prep" aria-busy="true">
        <div className="seneca-prep-ready-bar seneca-prep-ready-bar--loading">
          <div className="seneca-prep-ready-bar-main">
            <SenecaBrandMark />
            <div className="seneca-prep-ready-bar-copy">
              <strong className="seneca-prep-ready-bar-title">Building your prep brief</strong>
              <span className="seneca-prep-ready-bar-sub">Reviewing check-ins, goals, and open tasks…</span>
            </div>
          </div>
          <span className="seneca-prep-ready-spinner" aria-hidden />
        </div>
      </aside>
    );
  }

  if (compact && isCompactCollapsed && err) {
    return (
      <aside className="seneca-prep-card seneca-prep-card--compact" aria-label="Seneca prep">
        <div className="seneca-prep-ready-bar seneca-prep-ready-bar--error">
          <div className="seneca-prep-ready-bar-main">
            <SenecaBrandMark />
            <div className="seneca-prep-ready-bar-copy">
              <strong className="seneca-prep-ready-bar-title">Prep unavailable</strong>
              <span className="seneca-prep-ready-bar-sub">{err}</span>
            </div>
          </div>
          <button type="button" className="seneca-prep-ready-action" onClick={loadPrep}>
            Try again
          </button>
        </div>
      </aside>
    );
  }

  if (compact && isCompactCollapsed && prep) {
    const preview = prepPreviewLine(prep);
    return (
      <aside className="seneca-prep-card seneca-prep-card--compact seneca-prep-card--ready" aria-label="Seneca prep">
        <div className="seneca-prep-ready-bar seneca-prep-ready-bar--ready">
          <div className="seneca-prep-ready-bar-main">
            <SenecaBrandMark />
            <div className="seneca-prep-ready-bar-copy">
              <span className="seneca-prep-ready-badge">
                <IconPrepCheck />
                Prep ready
              </span>
              <span className="seneca-prep-ready-bar-summary">{buildPrepSummary(prep)}</span>
              {preview ? <span className="seneca-prep-ready-bar-preview">{preview}</span> : null}
            </div>
          </div>
          <button type="button" className="seneca-prep-ready-action" onClick={() => setExpanded(true)}>
            View prep
          </button>
        </div>
      </aside>
    );
  }

  if (compact && isCompactCollapsed && !showAiPrep) {
    return (
      <aside className="seneca-prep-card seneca-prep-card--compact" aria-label="Seneca prep">
        <div className="seneca-prep-ready-bar seneca-prep-ready-bar--idle">
          <div className="seneca-prep-ready-bar-main">
            <SenecaBrandMark />
            <div className="seneca-prep-ready-bar-copy">
              <strong className="seneca-prep-ready-bar-title">Optional Seneca prep</strong>
              <span className="seneca-prep-ready-bar-sub">
                Review past check-ins, goals, and tasks before you meet.
              </span>
            </div>
          </div>
          <button type="button" className="seneca-prep-ready-action seneca-prep-ready-action--primary" onClick={loadPrep}>
            <IconPrepSpark />
            Prep with Seneca
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`seneca-prep-card${compact ? " seneca-prep-card--expanded" : ""}`}
      aria-label="Seneca prep"
    >
      <header className="seneca-prep-head">
        <div className="seneca-prep-head-row">
          <SenecaBrandMark />
          <span className="seneca-kicker">Prep</span>
          {prep && !loading ? (
            <span className="seneca-prep-ready-badge seneca-prep-ready-badge--inline">
              <IconPrepCheck />
              Ready
            </span>
          ) : null}
        </div>
        {compact ? (
          <button type="button" className="seneca-prep-toggle" onClick={() => setExpanded(false)}>
            Hide prep
          </button>
        ) : null}
      </header>

      <div className="seneca-prep-body">
        <SenecaDisclaimer />
        <PrepSection title="Leader prep" items={leaderPrepSteps} />

        {!showAiPrep ? (
          <div className="seneca-prep-request">
            <p className="seneca-prep-request-copy">
              Optional — Seneca can review past check-ins, goals, and open tasks before you meet.
            </p>
            <button type="button" className="seneca-prep-request-btn" onClick={loadPrep}>
              Prep with Seneca
            </button>
          </div>
        ) : null}

        {loading ? <p className="enterprise-muted seneca-prep-loading">Building your prep brief…</p> : null}
        {err ? (
          <div className="seneca-prep-request">
            <p className="enterprise-form-error" role="alert">{err}</p>
            <button type="button" className="seneca-prep-request-btn seneca-prep-request-btn--secondary" onClick={loadPrep}>
              Try again
            </button>
          </div>
        ) : null}

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
    </aside>
  );
}
