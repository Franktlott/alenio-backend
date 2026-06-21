import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { workspaceChecklistHubUrl } from "../../lib/api";

type Props = {
  hubToken: string | null;
  workspaceName?: string;
  checklistCount?: number;
  onNewChecklist?: () => void;
  showAddPrompt?: boolean;
};

function printWorkspaceChecklistQr(workspaceName: string, qrDataUrl: string, url: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${workspaceName} — Checklists</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; color: #0f172a; }
  h1 { font-size: 1.5rem; margin: 0 0 0.35rem; }
  .sub { color: #64748b; margin: 0 0 1.25rem; }
  img { width: 280px; height: 280px; border: 1px solid #e2e8f0; border-radius: 12px; }
  .url { font-size: 11px; word-break: break-all; color: #475569; margin: 1rem auto 0; max-width: 360px; }
  .brand { margin-top: 1.25rem; font-size: 12px; color: #94a3b8; }
</style></head><body>
  <h1>${workspaceName}</h1>
  <p class="sub">Scan to open Today&apos;s Checklists on iPad · No login required</p>
  <img src="${qrDataUrl}" alt="Workspace checklist QR code" />
  <p class="url">${url}</p>
  <p class="brand">Alenio Enterprise</p>
</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function LocationChecklistQrPanel({
  hubToken,
  workspaceName = "Workspace",
  checklistCount = 0,
  onNewChecklist,
  showAddPrompt = false,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const checklistPageUrl = hubToken ? workspaceChecklistHubUrl(hubToken) : null;

  useEffect(() => {
    if (!checklistPageUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(checklistPageUrl, {
      margin: 1,
      width: 280,
      color: { dark: "#312e81", light: "#ffffff" },
    }).then((data) => {
      if (!cancelled) setQrDataUrl(data);
    });
    return () => {
      cancelled = true;
    };
  }, [checklistPageUrl]);

  const copyLink = async () => {
    if (!checklistPageUrl) return;
    try {
      await navigator.clipboard.writeText(checklistPageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!hubToken) {
    return (
      <div className="enterprise-checklist-qr-panel enterprise-checklist-qr-panel--empty">
        <div className="enterprise-checklist-qr-panel__placeholder" aria-hidden>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h3v3h-3z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="enterprise-checklist-qr-panel__empty-copy">
          <strong>Workspace checklist QR</strong>
          <p className="enterprise-muted">
            One QR code for this workspace. Associates pick a checklist on the iPad — no account needed.
          </p>
          {showAddPrompt && onNewChecklist ? (
            <button type="button" className="enterprise-modal-primary-btn" onClick={onNewChecklist}>
              + New checklist
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="enterprise-checklist-qr-panel">
      <div className="enterprise-checklist-qr-panel__code">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for ${workspaceName} checklists`}
            className="enterprise-checklist-qr-panel__img"
          />
        ) : (
          <div className="enterprise-checklist-qr-panel__img enterprise-checklist-qr-panel__img--loading">Generating…</div>
        )}
      </div>
      <div className="enterprise-checklist-qr-panel__details">
        <p className="enterprise-checklist-qr-panel__eyebrow">Workspace checklist page · iPad</p>
        <h3 className="enterprise-checklist-qr-panel__name">{workspaceName}</h3>
        <p className="enterprise-checklist-qr-panel__meta enterprise-muted">
          {checklistCount} checklist{checklistCount === 1 ? "" : "s"} on this page
        </p>
        <p className="enterprise-checklist-qr-panel__url">{checklistPageUrl}</p>
        <div className="enterprise-checklist-qr-panel__actions">
          <button type="button" className="enterprise-team-pill-btn" onClick={() => void copyLink()}>
            {copied ? "Copied" : "Share link"}
          </button>
          <button
            type="button"
            className="enterprise-team-pill-btn"
            disabled={!qrDataUrl || !checklistPageUrl}
            onClick={() =>
              qrDataUrl && checklistPageUrl && printWorkspaceChecklistQr(workspaceName, qrDataUrl, checklistPageUrl)
            }
          >
            Print
          </button>
          {checklistPageUrl ? (
            <a
              href={checklistPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="enterprise-team-pill-btn enterprise-checklist-qr-panel__open"
            >
              Open page
            </a>
          ) : null}
          {onNewChecklist ? (
            <button type="button" className="enterprise-team-pill-btn enterprise-checklist-share-btn" onClick={onNewChecklist}>
              + New checklist
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
