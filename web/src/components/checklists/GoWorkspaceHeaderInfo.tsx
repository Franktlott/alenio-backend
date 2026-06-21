import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { alenioGoEntryUrl, workspaceChecklistHubUrl } from "../../lib/api";
import { formatGoRelative } from "../../lib/go-dashboard-utils";

type Props = {
  teamName?: string;
  teamImage?: string | null;
  /** Preferred: location Go Code for /aleniogo */
  goCode?: string | null;
  /** Legacy hub token fallback */
  hubToken?: string | null;
  ipadConnected: boolean;
  checklistCount: number;
  lastSeen: string | null;
};

export function GoWorkspaceHeaderInfo({
  teamName,
  teamImage,
  goCode = null,
  hubToken = null,
  ipadConnected,
  checklistCount,
  lastSeen,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const entryUrl = goCode ? alenioGoEntryUrl(goCode) : hubToken ? workspaceChecklistHubUrl(hubToken) : null;

  useEffect(() => {
    if (!entryUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(entryUrl, {
      margin: 0,
      width: 88,
      color: { dark: "#6336e4", light: "#ffffff" },
    }).then((data) => {
      if (!cancelled) setQrDataUrl(data);
    });
    return () => {
      cancelled = true;
    };
  }, [entryUrl]);

  return (
    <div className="go-workspace-header" id="go-workspace-header" data-testid="go-workspace-header">
      <div className="go-workspace-header__copy">
        <div className="go-workspace-header__identity">
          <div className="go-workspace-header__thumb-wrap">
            {teamImage ? (
              <img src={teamImage} alt="" className="go-workspace-header__thumb" />
            ) : (
              <span className="go-workspace-header__thumb-fallback">{teamName?.[0]?.toUpperCase() ?? "W"}</span>
            )}
          </div>
          <div className="go-workspace-header__text">
            <strong className="go-workspace-header__name">{teamName ?? "Workspace"}</strong>
            <span className={`go-workspace-header__status${ipadConnected ? " go-workspace-header__status--on" : ""}`}>
              <span className="go-workspace-header__status-dot" aria-hidden />
              {ipadConnected ? "iPad Connected" : "iPad Not Connected"}
            </span>
          </div>
        </div>
        <p className="go-workspace-header__meta">
          {checklistCount} active checklist{checklistCount === 1 ? "" : "s"}
          {lastSeen ? <> · Last seen {formatGoRelative(lastSeen)}</> : null}
        </p>
        {goCode ? (
          <div className="go-workspace-header__go-code">
            <span className="go-workspace-header__go-code-label">Go Code</span>
            <strong className="go-workspace-header__go-code-value">{goCode}</strong>
          </div>
        ) : entryUrl ? (
          <p className="go-workspace-header__go-code-loading">Loading Go Code…</p>
        ) : null}
      </div>
      {entryUrl ? (
        <a
          href={entryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="go-workspace-header__qr-link"
          title={goCode ? "Open Alenio Go" : "Open iPad setup"}
          aria-label={`QR code for ${teamName ?? "workspace"} Alenio Go`}
        >
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="" className="go-workspace-header__qr" />
          ) : (
            <span className="go-workspace-header__qr go-workspace-header__qr--loading">…</span>
          )}
        </a>
      ) : null}
    </div>
  );
}
