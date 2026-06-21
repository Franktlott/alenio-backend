import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { checklistPublicUrl } from "../../lib/api";
import type { ChecklistLocationRow } from "../../lib/api";
import { ChecklistKioskManagerPreview } from "./kiosk/ChecklistKioskManagerPreview";

type Props = {
  location: ChecklistLocationRow;
  teamName?: string;
  onClose: () => void;
};

export function LocationChecklistLinkQrModal({ location, teamName, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const checklistPageUrl = checklistPublicUrl(location.publicToken);

  useEffect(() => {
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
    try {
      await navigator.clipboard.writeText(checklistPageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-panel enterprise-checklist-link-modal enterprise-checklist-link-modal--wide"
        role="dialog"
        aria-labelledby="checklist-link-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="checklist-link-title" className="enterprise-modal-title">
          {location.name} checklist page
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">
          This QR code and link open the location checklist on a shared iPad — no login required.
          {location.items.length === 0 ? " Add tasks anytime; the page is ready now." : null}
        </p>

        <div className="enterprise-checklist-link-grid">
          <div className="enterprise-checklist-link-share enterprise-checklist-link-share--qr-first">
            <div className="enterprise-checklist-qr-wrap enterprise-checklist-qr-wrap--hero">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${location.name} checklist page`}
                  className="enterprise-checklist-qr enterprise-checklist-qr--hero"
                />
              ) : (
                <div className="enterprise-checklist-qr enterprise-checklist-qr--hero enterprise-checklist-qr--loading">
                  Generating…
                </div>
              )}
              <p className="enterprise-checklist-qr-hint">
                Scan to open <strong>{location.name}</strong> on iPad
              </p>
            </div>

            <p className="enterprise-checklist-link-url-label">Checklist page URL</p>
            <p className="enterprise-checklist-link-url">{checklistPageUrl}</p>

            <div className="enterprise-modal-actions enterprise-checklist-link-actions">
              <button type="button" className="enterprise-inline-link" onClick={onClose}>
                Close
              </button>
              <button type="button" className="enterprise-modal-primary-btn" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy checklist link"}
              </button>
            </div>
          </div>

          <ChecklistKioskManagerPreview location={location} teamName={teamName} />
        </div>
      </div>
    </div>
  );
}
