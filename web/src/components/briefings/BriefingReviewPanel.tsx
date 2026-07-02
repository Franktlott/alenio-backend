import { useCallback, useRef, useState } from "react";
import type { BriefingRow } from "../../lib/api";
import { BriefingDocumentViewer } from "./BriefingDocumentViewer";
import { BriefingSignaturePad } from "./BriefingSignaturePad";
import { BriefingThankYouOverlay } from "./BriefingThankYouOverlay";

type Props = {
  briefing: BriefingRow;
  documentFetchPath: string;
  useAuth?: boolean;
  busy?: boolean;
  error?: string | null;
  onComplete: (payload: {
    initials?: string;
    signatureData?: string | null;
    reviewerName?: string | null;
  }) => Promise<void>;
};

function scrollBriefingToTop(root: HTMLElement | null) {
  if (!root) return;
  root.scrollIntoView({ behavior: "smooth", block: "start" });
  root.querySelector<HTMLElement>(".briefing-doc-pdf-pages")?.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function BriefingReviewPanel({ briefing, documentFetchPath, useAuth, busy, error, onComplete }: Props) {
  const reviewRef = useRef<HTMLDivElement>(null);
  const [initials, setInitials] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [thankYouName, setThankYouName] = useState<string | null>(null);
  const [signatureResetKey, setSignatureResetKey] = useState(0);

  const finishThankYou = useCallback(() => {
    setThankYouName(null);
    scrollBriefingToTop(reviewRef.current);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
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
    const signedName = reviewerName.trim();
    try {
      await onComplete({
        initials: initials.trim() || undefined,
        signatureData,
        reviewerName: signedName,
      });
      setInitials("");
      setReviewerName("");
      setSignatureData(null);
      setSignatureResetKey((k) => k + 1);
      setThankYouName(signedName);
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
    <div className="briefing-review" ref={reviewRef}>
      {thankYouName ? <BriefingThankYouOverlay reviewerName={thankYouName} onDone={finishThankYou} /> : null}

      <header className="briefing-review-head">
        <h2>{briefing.title}</h2>
        <p className="enterprise-muted">{briefing.description}</p>
      </header>

      <BriefingDocumentViewer briefing={briefing} documentFetchPath={documentFetchPath} useAuth={useAuth} />

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

        <button type="submit" className="enterprise-alenio-go-link-btn briefing-complete-btn" disabled={busy || !!thankYouName}>
          {busy ? "Saving…" : "Complete Briefing"}
        </button>
      </form>
    </div>
  );
}
