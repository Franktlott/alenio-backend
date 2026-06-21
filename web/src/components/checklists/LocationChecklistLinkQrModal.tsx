import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { checklistPublicUrl } from "../../lib/api";
import type { ChecklistLocationRow } from "../../lib/api";

type Props = {
  location: ChecklistLocationRow;
  onClose: () => void;
};

export function LocationChecklistLinkQrModal({ location, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = checklistPublicUrl(location.publicToken);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#1e293b", light: "#ffffff" } }).then(
      (data) => {
        if (!cancelled) setQrDataUrl(data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-panel enterprise-checklist-link-modal"
        role="dialog"
        aria-labelledby="checklist-link-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="checklist-link-title" className="enterprise-modal-title">
          Share checklist
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">{location.name}</p>
        <p className="enterprise-checklist-link-url">{url}</p>
        <div className="enterprise-modal-actions enterprise-checklist-link-actions">
          <button type="button" className="enterprise-inline-link" onClick={onClose}>
            Close
          </button>
          <button type="button" className="enterprise-modal-primary-btn" onClick={() => void copyLink()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        {qrDataUrl ? (
          <div className="enterprise-checklist-qr-wrap">
            <img src={qrDataUrl} alt={`QR code for ${location.name} checklist`} className="enterprise-checklist-qr" />
            <p className="enterprise-muted enterprise-checklist-qr-hint">Scan on a shared device at this location.</p>
          </div>
        ) : (
          <p className="enterprise-muted">Generating QR code…</p>
        )}
      </div>
    </div>
  );
}
