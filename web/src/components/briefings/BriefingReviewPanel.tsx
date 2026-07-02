import { useState } from "react";
import type { BriefingRow } from "../../lib/api";
import { BriefingDocumentViewer } from "./BriefingDocumentViewer";
import { BriefingSignaturePad } from "./BriefingSignaturePad";

type Props = {
  briefing: BriefingRow;
  busy?: boolean;
  error?: string | null;
  kioskMode?: boolean;
  onComplete: (payload: {
    initials?: string;
    signatureData?: string | null;
    reviewerName?: string | null;
  }) => Promise<void>;
};

export function BriefingReviewPanel({ briefing, busy, error, kioskMode, onComplete }: Props) {
  const [initials, setInitials] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const alreadyDone = briefing.status === "reviewed";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (briefing.requireSignature && !signatureData) {
      setLocalErr("Add your signature to complete this briefing.");
      return;
    }
    if (!briefing.requireSignature && briefing.allowInitials && !initials.trim()) {
      setLocalErr("Enter your initials to complete this briefing.");
      return;
    }
    if (kioskMode && !reviewerName.trim()) {
      setLocalErr("Enter your name so your completion is recorded.");
      return;
    }
    await onComplete({
      initials: initials.trim() || undefined,
      signatureData,
      reviewerName: kioskMode ? reviewerName.trim() : undefined,
    });
  }

  return (
    <div className="briefing-review">
      <header className="briefing-review-head">
        <h2>{briefing.title}</h2>
        <p className="enterprise-muted">{briefing.description}</p>
      </header>

      <BriefingDocumentViewer briefing={briefing} />

      {alreadyDone ? (
        <div className="briefing-review-done" role="status">
          <strong>Reviewed</strong>
          <span>You completed this briefing{briefing.completedAt ? ` on ${new Date(briefing.completedAt).toLocaleString()}` : ""}.</span>
        </div>
      ) : (
        <form className="briefing-review-confirm" onSubmit={(e) => void submit(e)}>
          <p className="briefing-review-confirm-text">I confirm that I have reviewed and understand this briefing.</p>

          {kioskMode ? (
            <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-reviewer-name">
              Your name
            </label>
          ) : null}
          {kioskMode ? (
            <input
              id="briefing-reviewer-name"
              className="enterprise-alenio-go-alert-input"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Alex M."
              required
            />
          ) : null}

          {briefing.allowInitials && !briefing.requireSignature ? (
            <>
              <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-initials">
                Enter initials
              </label>
              <input
                id="briefing-initials"
                className="enterprise-alenio-go-alert-input briefing-initials-input"
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 8))}
                maxLength={8}
                placeholder="Initial to Complete"
                autoComplete="off"
              />
            </>
          ) : null}

          {briefing.requireSignature ? (
            <>
              <p className="enterprise-alenio-go-alert-label">Sign below</p>
              <BriefingSignaturePad onChange={setSignatureData} disabled={busy} />
            </>
          ) : null}

          {localErr || error ? (
            <p className="enterprise-alenio-go-alert-error" role="alert">
              {localErr || error}
            </p>
          ) : null}

          <button type="submit" className="enterprise-alenio-go-link-btn briefing-complete-btn" disabled={busy}>
            {busy ? "Saving…" : "Complete Briefing"}
          </button>
        </form>
      )}
    </div>
  );
}
