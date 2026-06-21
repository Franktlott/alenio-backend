import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { workspaceChecklistHubUrl } from "../../lib/api";

type Props = {
  hubToken: string | null;
  workspaceName?: string;
};

export function GoLocationQrCompact({ hubToken, workspaceName = "Workspace" }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const url = hubToken ? workspaceChecklistHubUrl(hubToken) : null;

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(url, {
      margin: 0,
      width: 120,
      color: { dark: "#5b21b6", light: "#ffffff" },
    }).then((data) => {
      if (!cancelled) setQrDataUrl(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return (
      <div className="go-location-qr go-location-qr--empty">
        <p className="enterprise-muted">QR unavailable</p>
      </div>
    );
  }

  return (
    <div className="go-location-qr">
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={`QR code for ${workspaceName} checklists`} className="go-location-qr__img" />
      ) : (
        <div className="go-location-qr__img go-location-qr__img--loading">…</div>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className="go-btn go-btn--ghost go-btn--sm">
        View Setup
      </a>
    </div>
  );
}
