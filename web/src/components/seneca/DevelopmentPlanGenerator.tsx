import { useEffect, useState } from "react";
import { createDevelopmentGoal } from "../../lib/api";
import { fetchSenecaDevelopmentPlan, type SenecaDevelopmentGoalDraft } from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer } from "./SenecaShared";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  contextNotes?: string;
  checkInSummary?: string;
  initialDraft?: SenecaDevelopmentGoalDraft | null;
  onCreated: () => void;
  onClose: () => void;
};

export function DevelopmentPlanGenerator({
  teamId,
  memberUserId,
  memberName,
  managerName,
  contextNotes,
  checkInSummary,
  initialDraft,
  onCreated,
  onClose,
}: Props) {
  const [generating, setGenerating] = useState(!initialDraft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<SenecaDevelopmentGoalDraft | null>(initialDraft ?? null);

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
      setGenerating(false);
    }
  }, [initialDraft]);

  const generate = async () => {
    setGenerating(true);
    setErr(null);
    try {
      const plan = await fetchSenecaDevelopmentPlan(teamId, memberUserId, {
        memberName,
        managerName,
        contextNotes,
        checkInSummary,
      });
      setDraft({
        goalTitle: plan.goalTitle,
        focusArea: plan.focusArea,
        actionSteps30Day: plan.actionSteps30Day,
        managerSupportNeeded: plan.managerSupportNeeded,
        successMeasures: plan.successMeasures,
        targetDate: plan.targetDate,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not generate plan.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!draft?.goalTitle.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const steps = [
        ...draft.actionSteps30Day.filter((s) => s.trim()),
        ...(draft.managerSupportNeeded.length
          ? [`Manager support: ${draft.managerSupportNeeded.join("; ")}`]
          : []),
        ...(draft.successMeasures.length ? [`Success measures: ${draft.successMeasures.join("; ")}`] : []),
        ...(draft.targetDate ? [`Target date: ${draft.targetDate}`] : []),
      ].filter(Boolean);
      await createDevelopmentGoal(teamId, memberUserId, {
        skill: draft.goalTitle.trim(),
        steps: steps.length > 0 ? steps : [draft.focusArea || "Define first action step"],
      });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="seneca-dev-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-dev-plan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" disabled={saving} onClick={onClose}>
          ×
        </button>
        <header className="seneca-summary-head">
          <SenecaBrandMark />
          <h3 id="seneca-dev-plan-title" className="seneca-summary-title">
            Development plan generator
          </h3>
          <p className="enterprise-muted seneca-summary-sub">
            Seneca drafts a structured 30-day plan for {memberName}. You approve before saving.
          </p>
        </header>
        <SenecaDisclaimer />

        {!draft && !generating ? (
          <button type="button" className="seneca-checkin-apply-btn" onClick={() => void generate()}>
            Generate with Seneca
          </button>
        ) : null}
        {generating ? <p className="enterprise-muted">Seneca is drafting a plan…</p> : null}
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

        {draft && !generating ? (
          <div className="seneca-dev-plan-form">
            <label className="seneca-dev-plan-label" htmlFor="seneca-goal-title">
              Goal title
            </label>
            <input
              id="seneca-goal-title"
              className="auth-input seneca-dev-plan-input"
              value={draft.goalTitle}
              onChange={(e) => setDraft({ ...draft, goalTitle: e.target.value })}
            />
            <label className="seneca-dev-plan-label" htmlFor="seneca-focus-area">
              Focus area
            </label>
            <input
              id="seneca-focus-area"
              className="auth-input seneca-dev-plan-input"
              value={draft.focusArea}
              onChange={(e) => setDraft({ ...draft, focusArea: e.target.value })}
            />
            <label className="seneca-dev-plan-label">30-day action steps</label>
            <textarea
              className="auth-input seneca-dev-plan-textarea"
              rows={4}
              value={draft.actionSteps30Day.join("\n")}
              onChange={(e) =>
                setDraft({ ...draft, actionSteps30Day: e.target.value.split("\n").filter((l) => l.trim()) })
              }
            />
            <label className="seneca-dev-plan-label">Manager support needed</label>
            <textarea
              className="auth-input seneca-dev-plan-textarea"
              rows={2}
              value={draft.managerSupportNeeded.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  managerSupportNeeded: e.target.value.split("\n").filter((l) => l.trim()),
                })
              }
            />
            <label className="seneca-dev-plan-label">Success measures</label>
            <textarea
              className="auth-input seneca-dev-plan-textarea"
              rows={2}
              value={draft.successMeasures.join("\n")}
              onChange={(e) =>
                setDraft({ ...draft, successMeasures: e.target.value.split("\n").filter((l) => l.trim()) })
              }
            />
            <label className="seneca-dev-plan-label" htmlFor="seneca-target-date">
              Target date
            </label>
            <input
              id="seneca-target-date"
              type="date"
              className="auth-input seneca-dev-plan-input"
              value={draft.targetDate?.slice(0, 10) ?? ""}
              onChange={(e) => setDraft({ ...draft, targetDate: e.target.value || null })}
            />
          </div>
        ) : null}

        <footer className="seneca-summary-footer">
          <button type="button" className="enterprise-inline-link" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          {draft ? (
            <button type="button" className="enterprise-modal-primary-btn" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save development goal"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
