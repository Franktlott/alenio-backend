import { useEffect, useRef, useState } from "react";
import { submitOneOnOneAssociateFeedback, type OneOnOneAssociateFeedbackContext } from "../lib/api";
import {
  ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS,
  ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE,
  ASSOCIATE_FEEDBACK_INTRO,
  ASSOCIATE_FEEDBACK_MODE_LABEL,
  ASSOCIATE_FEEDBACK_NONE_LABEL,
  ASSOCIATE_FEEDBACK_PLACEHOLDER,
  ASSOCIATE_FEEDBACK_SUBMIT_LABEL,
  LEADER_COMMENTS_PREVIEW_TITLE,
  NO_FEEDBACK_VALUE,
} from "../lib/one-on-one-feedback";

type Props = {
  teamId: string;
  memberUserId: string;
  meetingId: string;
  context: OneOnOneAssociateFeedbackContext;
  onCompletionStarted?: () => void;
  onCompletionFailed?: () => void;
  onSubmitted?: () => void;
};

export function OneOnOneAssociateFeedbackForm({
  teamId,
  memberUserId,
  meetingId,
  context,
  onCompletionStarted,
  onCompletionFailed,
  onSubmitted,
}: Props) {
  const [mode, setMode] = useState<"feedback" | "none">(
    context.currentResponse === NO_FEEDBACK_VALUE ? "none" : "feedback",
  );
  const [feedback, setFeedback] = useState(
    context.currentResponse === NO_FEEDBACK_VALUE ? "" : context.currentResponse,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(context.submitted);
  const [completedInSession, setCompletedInSession] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<"feedback" | "none">(
    context.currentResponse === NO_FEEDBACK_VALUE ? "none" : "feedback",
  );
  const onSubmittedRef = useRef(onSubmitted);
  onSubmittedRef.current = onSubmitted;

  useEffect(() => {
    if (!completedInSession) return;
    const timer = window.setTimeout(() => onSubmittedRef.current?.(), ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [completedInSession]);

  const onSubmit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const response = mode === "none" ? NO_FEEDBACK_VALUE : feedback.trim();
      if (mode === "feedback" && !response) {
        setErr("Add your notes or choose nothing to add.");
        return;
      }
      onCompletionStarted?.();
      await submitOneOnOneAssociateFeedback(teamId, memberUserId, meetingId, {
        fieldId: context.fieldId,
        response,
      });
      setSubmittedMode(mode);
      setDone(true);
      setCompletedInSession(true);
    } catch (e) {
      onCompletionFailed?.();
      setErr(e instanceof Error ? e.message : "Could not save your notes.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div
        className={`enterprise-oneone-feedback-done${
          completedInSession ? " enterprise-oneone-feedback-done--animate" : ""
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="enterprise-oneone-feedback-done-check" aria-hidden />
        <p className="enterprise-oneone-feedback-done-title">{ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE}</p>
        <p className="enterprise-muted enterprise-oneone-feedback-done-sub">
          {submittedMode === "none" ? "Recorded as nothing to add." : "Your takeaways are saved to the check-in."}
        </p>
      </div>
    );
  }

  return (
    <div className="enterprise-oneone-feedback-form">
      <p className="enterprise-oneone-feedback-intro">{ASSOCIATE_FEEDBACK_INTRO}</p>
      {context.helpText ? <p className="enterprise-muted enterprise-oneone-feedback-help">{context.helpText}</p> : null}

      {context.leaderComments ? (
        <div className="enterprise-oneone-feedback-leader-notes">
          <p className="enterprise-oneone-feedback-leader-notes-label">
            {context.leaderCommentsLabel ?? LEADER_COMMENTS_PREVIEW_TITLE}
          </p>
          <p className="enterprise-oneone-feedback-leader-notes-body">{context.leaderComments}</p>
        </div>
      ) : null}

      <div className="enterprise-oneone-feedback-mode">
        <label className="enterprise-oneone-feedback-mode-option">
          <input
            type="radio"
            name={`feedback-mode-${context.fieldId}`}
            checked={mode === "feedback"}
            onChange={() => setMode("feedback")}
          />
          <span>{ASSOCIATE_FEEDBACK_MODE_LABEL}</span>
        </label>
        <label className="enterprise-oneone-feedback-mode-option">
          <input
            type="radio"
            name={`feedback-mode-${context.fieldId}`}
            checked={mode === "none"}
            onChange={() => setMode("none")}
          />
          <span>{ASSOCIATE_FEEDBACK_NONE_LABEL}</span>
        </label>
      </div>

      {mode === "feedback" ? (
        <textarea
          className="auth-input enterprise-oneone-feedback-textarea"
          rows={6}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={ASSOCIATE_FEEDBACK_PLACEHOLDER}
          aria-label="Check-in notes"
        />
      ) : (
        <p className="enterprise-muted enterprise-oneone-feedback-none-copy">
          We&apos;ll record that you have nothing to add right now.
        </p>
      )}

      {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

      <div className="enterprise-oneone-feedback-actions">
        <button
          type="button"
          className="enterprise-oneone-templates-primary-btn"
          disabled={saving}
          onClick={() => void onSubmit()}
        >
          {saving ? "Saving…" : ASSOCIATE_FEEDBACK_SUBMIT_LABEL}
        </button>
      </div>
    </div>
  );
}
