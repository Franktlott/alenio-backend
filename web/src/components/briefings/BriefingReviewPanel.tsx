import { useState } from "react";
import type { BriefingRow } from "../../lib/api";
import { BriefingDocumentViewer } from "./BriefingDocumentViewer";
import { BriefingSignaturePad } from "./BriefingSignaturePad";

type Props = {
  briefing: BriefingRow;
  busy?: boolean;
  error?: string | null;
  onComplete: (payload: {
    initials?: string;
    signatureData?: string | null;
    reviewerName?: string | null;
  }) => Promise<void>;
};

export function BriefingReviewPanel({ briefing, busy, error, onComplete }: Props) {
  const [initials, setInitials] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [signatureResetKey, setSignatureResetKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    setSuccess(null);
    if (!reviewerName.trim()) {
      setLocalErr("Enter your name so your completion is recorded.");
      return;
    }
    if (briefing.requireSignature && !signatureData) {
      setLocalErr("Add your signature to complete this briefing.");
      return;
    }
    if (!briefing.requireSignature && briefing.allowInitials && !initials.trim()) {
      setLocalErr("Enter your initials to complete this briefing.");
      return;
    }
    try {
      await onComplete({
        initials: initials.trim() || undefined,
        signatureData,
        reviewerName: reviewerName.trim(),
      });
      setSuccess("Signed. The next associate can review and sign below.");
      setInitials("");
      setReviewerName("");
      setSignatureData(null);
      setSignatureResetKey((k) => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete briefing.";
      if (message.toLowerCase().includes("already")) {
        setLocalErr("This name and initials were already recorded for this briefing.");
      } else {
        setLocalErr(message);
      }
    }
  }

  return (
    <div className="briefing-review">
      <header className="briefing-review-head">
        <h2>{briefing.title}</h2>
        <p className="enterprise-muted">{briefing.description}</p>
      </header>

      <BriefingDocumentViewer briefing={briefing} />

      <form className="briefing-review-confirm" onSubmit={(e) => void submit(e)}>
        <p className="briefing-review-confirm-text">I confirm that I have reviewed and understand this briefing.</p>

        <label className="enterprise-alenio-go-alert-label" htmlFor="briefing-reviewer-name">
          Your name
        </label>
        <input
          id="briefing-reviewer-name"
          className="enterprise-alenio-go-alert-input"
          value={reviewerName}
          onChange={(e) => setReviewerName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Alex M."
          required
        />

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
            <BriefingSignaturePad key={signatureResetKey} onChange={setSignatureData} disabled={busy} />
          </>
        ) : null}

        {localErr || error ? (
          <p className="enterprise-alenio-go-alert-error" role="alert">
            {localErr || error}
          </p>
        ) : null}

        {success ? (
          <div className="briefing-review-done" role="status">
            <strong>Recorded</strong>
            <span>{success}</span>
          </div>
        ) : null}

        <button type="submit" className="enterprise-alenio-go-link-btn briefing-complete-btn" disabled={busy}>
          {busy ? "Saving…" : "Complete Briefing"}
        </button>
      </form>
    </div>
  );
}
