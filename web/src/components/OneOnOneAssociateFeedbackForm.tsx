import { useState } from "react";
import { submitOneOnOneAssociateFeedback, type OneOnOneAssociateFeedbackContext } from "../lib/api";
import { NO_FEEDBACK_VALUE } from "../lib/one-on-one-feedback";

type Props = {
  teamId: string;
  memberUserId: string;
  meetingId: string;
  context: OneOnOneAssociateFeedbackContext;
  onSubmitted?: () => void;
};

export function OneOnOneAssociateFeedbackForm({
  teamId,
  memberUserId,
  meetingId,
  context,
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
  const [submittedMode, setSubmittedMode] = useState<"feedback" | "none">(
    context.currentResponse === NO_FEEDBACK_VALUE ? "none" : "feedback",
  );

  const onSubmit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const response = mode === "none" ? NO_FEEDBACK_VALUE : feedback.trim();
      if (mode === "feedback" && !response) {
        setErr("Enter your feedback or choose no feedback entered.");
        return;
      }
      await submitOneOnOneAssociateFeedback(teamId, memberUserId, meetingId, {
        fieldId: context.fieldId,
        response,
      });
      setSubmittedMode(mode);
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit feedback.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="enterprise-oneone-feedback-done">
        <p className="enterprise-oneone-feedback-done-title">Thanks — your response was saved.</p>
        <p className="enterprise-muted">
          {submittedMode === "none"
            ? "Recorded as no feedback entered."
            : "Your check-in feedback was saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="enterprise-oneone-feedback-form">
      <p className="enterprise-oneone-feedback-intro">
        Share your notes for <strong>{context.fieldLabel}</strong> from the {context.meetingTitle} check-in.
      </p>
      {context.helpText ? <p className="enterprise-muted enterprise-oneone-feedback-help">{context.helpText}</p> : null}

      <div className="enterprise-oneone-feedback-mode">
        <label className="enterprise-oneone-feedback-mode-option">
          <input
            type="radio"
            name={`feedback-mode-${context.fieldId}`}
            checked={mode === "feedback"}
            onChange={() => setMode("feedback")}
          />
          <span>Enter feedback</span>
        </label>
        <label className="enterprise-oneone-feedback-mode-option">
          <input
            type="radio"
            name={`feedback-mode-${context.fieldId}`}
            checked={mode === "none"}
            onChange={() => setMode("none")}
          />
          <span>No feedback entered</span>
        </label>
      </div>

      {mode === "feedback" ? (
        <textarea
          className="auth-input enterprise-oneone-feedback-textarea"
          rows={6}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={`Your thoughts on ${context.fieldLabel.toLowerCase()}…`}
          aria-label={context.fieldLabel}
        />
      ) : (
        <p className="enterprise-muted enterprise-oneone-feedback-none-copy">
          We&apos;ll record that you have no feedback for this question.
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
          {saving ? "Saving…" : "Submit feedback & complete"}
        </button>
      </div>
    </div>
  );
}
