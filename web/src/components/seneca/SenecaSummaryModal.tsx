import { useEffect, useState } from "react";
import { fetchSenecaSummary, type SenecaSummary } from "../../lib/seneca-api";
import type { OneOnOneTemplate } from "../../lib/api";
import { SenecaBrandMark, SenecaDisclaimer } from "./SenecaShared";
import type { SenecaFollowUpSuggestion } from "./SenecaCheckInPanel";
import type { SenecaDevelopmentGoalDraft } from "../../lib/seneca-api";

type Props = {
  open: boolean;
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  templateTitle: string;
  templateFields: OneOnOneTemplate["fields"];
  responses: Record<string, string | number>;
  followUpTasks: SenecaFollowUpSuggestion[];
  onClose: () => void;
  onAddFollowUpTasks: (tasks: SenecaFollowUpSuggestion[]) => void;
  onCreateDevelopmentGoal: (draft: SenecaDevelopmentGoalDraft) => void;
};

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="seneca-summary-section">
      <h4 className="seneca-summary-section-title">{title}</h4>
      <ul className="seneca-prep-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function SenecaSummaryModal({
  open,
  teamId,
  memberUserId,
  memberName,
  managerName,
  templateTitle,
  templateFields,
  responses,
  followUpTasks,
  onClose,
  onAddFollowUpTasks,
  onCreateDevelopmentGoal,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<SenecaSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchSenecaSummary(teamId, memberUserId, {
      templateTitle,
      templateFields: templateFields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
      responses,
      followUpTasks,
      memberName,
      managerName,
    })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not generate summary.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId, memberUserId, templateTitle, templateFields, responses, followUpTasks, memberName, managerName]);

  if (!open) return null;

  return (
    <div className="enterprise-modal-backdrop seneca-summary-backdrop" role="presentation" onClick={onClose}>
      <div
        className="seneca-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-summary-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <header className="seneca-summary-head">
          <SenecaBrandMark />
          <h3 id="seneca-summary-title" className="seneca-summary-title">
            Post-check-in summary
          </h3>
          <p className="enterprise-muted seneca-summary-sub">Review Seneca&apos;s recap before you finish.</p>
        </header>
        <SenecaDisclaimer />

        {loading ? <p className="enterprise-muted">Generating summary…</p> : null}
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

        {summary && !loading ? (
          <div className="seneca-summary-body">
            <section className="seneca-summary-section">
              <h4 className="seneca-summary-section-title">Conversation summary</h4>
              <p className="seneca-summary-text">{summary.conversationSummary}</p>
            </section>
            <BulletList title="Wins discussed" items={summary.winsDiscussed} />
            <BulletList title="Opportunities discussed" items={summary.opportunitiesDiscussed} />
            <BulletList title="Action items" items={summary.actionItems} />
            {summary.suggestedNextCheckInDate ? (
              <section className="seneca-summary-section">
                <h4 className="seneca-summary-section-title">Suggested next check-in</h4>
                <p className="seneca-summary-text">
                  {new Date(summary.suggestedNextCheckInDate).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </section>
            ) : null}
            {summary.followUpTasks.length > 0 ? (
              <section className="seneca-summary-section">
                <h4 className="seneca-summary-section-title">Suggested follow-up tasks</h4>
                <ul className="seneca-prep-list">
                  {summary.followUpTasks.map((t) => (
                    <li key={t.title}>{t.title}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="seneca-checkin-apply-btn"
                  onClick={() => onAddFollowUpTasks(summary.followUpTasks)}
                >
                  Add suggested tasks (review in next check-in)
                </button>
              </section>
            ) : null}
            {summary.draftDevelopmentGoal ? (
              <section className="seneca-summary-section">
                <h4 className="seneca-summary-section-title">Draft development goal</h4>
                <p className="seneca-summary-text">
                  <strong>{summary.draftDevelopmentGoal.goalTitle}</strong> — {summary.draftDevelopmentGoal.focusArea}
                </p>
                <button
                  type="button"
                  className="seneca-checkin-apply-btn"
                  onClick={() => onCreateDevelopmentGoal(summary.draftDevelopmentGoal!)}
                >
                  Review &amp; create goal
                </button>
              </section>
            ) : null}
          </div>
        ) : null}

        <footer className="seneca-summary-footer">
          <button type="button" className="enterprise-modal-primary-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
