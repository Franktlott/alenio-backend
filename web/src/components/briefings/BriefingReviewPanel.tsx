import { Link } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import type { BriefingRow } from "../../lib/api";
import { formatBriefingDateTime } from "../../lib/briefings-display";
import { BriefingDocumentViewer } from "./BriefingDocumentViewer";
import { BriefingDueDateEditor } from "./BriefingDueDateEditor";
import { BriefingSignaturePad } from "./BriefingSignaturePad";
import { BriefingStatusBadge } from "./BriefingStatusBadge";
import { BriefingThankYouOverlay } from "./BriefingThankYouOverlay";

type Props = {
  briefing: BriefingRow;
  documentFetchPath: string;
  useAuth?: boolean;
  alenioLoading?: boolean;
  onDocumentLoadingChange?: (loading: boolean) => void;
  layout?: "stack" | "console";
  teamName?: string;
  memberCount?: number;
  signedCount?: number;
  canManage?: boolean;
  adminHref?: string;
  teamId?: string;
  onDueDateSaved?: (dueAt: string | null) => void;
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

function documentLabel(briefing: BriefingRow): string {
  return briefing.documentFilename || "Briefing document";
}

export function BriefingReviewPanel({
  briefing,
  documentFetchPath,
  useAuth,
  alenioLoading,
  onDocumentLoadingChange,
  layout = "stack",
  teamName,
  memberCount = 0,
  signedCount,
  canManage,
  adminHref,
  teamId,
  onDueDateSaved,
  busy,
  error,
  onComplete,
}: Props) {
  const reviewRef = useRef<HTMLDivElement>(null);
  const [initials, setInitials] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [thankYouName, setThankYouName] = useState<string | null>(null);
  const [signatureResetKey, setSignatureResetKey] = useState(0);
  const [documentOpen, setDocumentOpen] = useState(layout !== "console");

  const finishThankYou = useCallback(() => {
    setThankYouName(null);
    scrollBriefingToTop(reviewRef.current);
    if (layout === "console") setDocumentOpen(false);
  }, [layout]);

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

  const requiresLabel = briefing.requireSignature
    ? "Signature to complete"
    : briefing.allowInitials
      ? "Initials to complete"
      : "Acknowledgement";

  const acknowledgeForm = (
    <form className="briefing-review-confirm briefing-console-ack" onSubmit={(e) => void submit(e)}>
      <h3 className="briefing-console-section-title">Acknowledge</h3>
      <p className="briefing-review-confirm-text">
        I acknowledge that I have reviewed and understand this briefing.
      </p>

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
            Enter your initials
          </label>
          <input
            id="briefing-initials"
            className="enterprise-alenio-go-alert-input briefing-initials-input"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 8))}
            maxLength={8}
            placeholder="Enter initials"
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

      <button
        type="submit"
        className="briefing-console-complete-btn"
        disabled={busy || !!thankYouName}
      >
        {busy ? "Saving…" : briefing.requireSignature ? "Sign to Complete" : "Initial to Complete"}
      </button>
      <p className="briefing-console-ack-foot">Your completion will be recorded with date and time.</p>
    </form>
  );

  if (layout === "console") {
    return (
      <div className="briefing-review briefing-review--console" ref={reviewRef}>
        {thankYouName ? <BriefingThankYouOverlay reviewerName={thankYouName} onDone={finishThankYou} /> : null}

        <div className="briefing-console-detail-grid">
          <div className="briefing-console-detail-main">
            <header className="briefing-console-detail-head">
              <div>
                <div className="briefing-console-detail-title-row">
                  <h2>{briefing.title}</h2>
                  <BriefingStatusBadge status={briefing.status} />
                </div>
                <p className="briefing-console-detail-desc">{briefing.description}</p>
              </div>
            </header>

            <section className="briefing-console-doc-section">
              <h3 className="briefing-console-section-title">Document to Review</h3>
              <div className="briefing-console-doc-card">
                <div className="briefing-console-doc-file">
                  <span className="briefing-console-doc-icon" aria-hidden>
                    📄
                  </span>
                  <div>
                    <strong>{documentLabel(briefing)}</strong>
                    <span className="enterprise-muted">PDF document</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="briefing-console-view-doc-btn"
                  onClick={() => setDocumentOpen((open) => !open)}
                >
                  {documentOpen ? "Hide Document" : "View Document"}
                  {!documentOpen ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  ) : null}
                </button>
              </div>
              {documentOpen ? (
                <BriefingDocumentViewer
                  briefing={briefing}
                  documentFetchPath={documentFetchPath}
                  useAuth={useAuth}
                  alenioLoading={alenioLoading}
                  onLoadingChange={onDocumentLoadingChange}
                />
              ) : null}
            </section>

            {acknowledgeForm}
          </div>

          <aside className="briefing-console-detail-meta">
            <dl>
              <div>
                <dt>Published</dt>
                <dd>{formatBriefingDateTime(briefing.publishedAt)}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>
                  {canManage && teamId ? (
                    <BriefingDueDateEditor
                      teamId={teamId}
                      briefingId={briefing.id}
                      dueAt={briefing.dueAt}
                      signedCount={signedCount ?? 0}
                      onSaved={onDueDateSaved}
                    />
                  ) : (
                    formatBriefingDateTime(briefing.dueAt)
                  )}
                </dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>
                  {teamName || "Workspace"}
                  <span className="briefing-console-meta-sub">All Associates ({memberCount})</span>
                </dd>
              </div>
              <div>
                <dt>Requires</dt>
                <dd>{requiresLabel}</dd>
              </div>
              <div>
                <dt>Document</dt>
                <dd>{documentLabel(briefing)}</dd>
              </div>
              {canManage && typeof signedCount === "number" ? (
                <div>
                  <dt>Signed</dt>
                  <dd>{signedCount} associate{signedCount === 1 ? "" : "s"}</dd>
                </div>
              ) : null}
            </dl>
            {canManage && adminHref ? (
              <Link to={adminHref} className="briefing-console-tracking-link">
                View sign-offs →
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="briefing-review" ref={reviewRef}>
      {thankYouName ? <BriefingThankYouOverlay reviewerName={thankYouName} onDone={finishThankYou} /> : null}

      <header className="briefing-review-head">
        <h2>{briefing.title}</h2>
        <p className="enterprise-muted">{briefing.description}</p>
      </header>

      <BriefingDocumentViewer
        briefing={briefing}
        documentFetchPath={documentFetchPath}
        useAuth={useAuth}
        alenioLoading={alenioLoading}
        onLoadingChange={onDocumentLoadingChange}
      />

      {acknowledgeForm}
    </div>
  );
}
