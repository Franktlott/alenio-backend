import { useEffect, useRef, useState } from "react";
import type { GoWorkplaceAlert } from "../../lib/api";
import { startGoAlertSoundLoop, stopGoAlertSoundLoop } from "../../lib/go-alert-sound";

function formatAlertTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

type BellProps = {
  alerts: GoWorkplaceAlert[];
};

export function GoKioskAlertBell({ alerts }: BellProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = alerts.length;

  return (
    <div className="go-kiosk-alert-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="go-kiosk-alert-bell"
        aria-label={count > 0 ? `Alerts, ${count} stored` : "Alerts"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="go-kiosk-alert-bell"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? (
          <span className="go-kiosk-alert-bell-badge">{count > 9 ? "9+" : count}</span>
        ) : null}
      </button>

      {open ? (
        <div className="go-kiosk-alert-panel" role="dialog" aria-label="Workplace alerts">
          <div className="go-kiosk-alert-panel-head">
            <span className="go-kiosk-alert-panel-title">Alerts</span>
            <span className="go-kiosk-alert-panel-sub">Received on this device</span>
          </div>
          {alerts.length === 0 ? (
            <p className="go-kiosk-alert-panel-empty">No alerts yet.</p>
          ) : (
            <ul className="go-kiosk-alert-panel-list">
              {alerts.map((alert) => (
                <li key={alert.id} className="go-kiosk-alert-panel-item">
                  <span className="go-kiosk-alert-panel-dot" aria-hidden />
                  <div className="go-kiosk-alert-panel-copy">
                    <strong>{alert.title}</strong>
                    <span>{alert.body}</span>
                    {alert.createdAt ? (
                      <time className="go-kiosk-alert-panel-time" dateTime={alert.createdAt}>
                        {formatAlertTime(alert.createdAt)}
                      </time>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

type ModalProps = {
  alert: GoWorkplaceAlert;
  onAcknowledge: () => void;
};

export function GoKioskAlertModal({ alert, onAcknowledge }: ModalProps) {
  useEffect(() => {
    if (!alert.playSound) return;
    startGoAlertSoundLoop();
    return () => stopGoAlertSoundLoop();
  }, [alert.id, alert.playSound]);

  function handleAcknowledge() {
    stopGoAlertSoundLoop();
    onAcknowledge();
  }

  return (
    <div
      className="go-kiosk-alert-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="go-kiosk-alert-modal-title"
      data-testid="go-kiosk-alert-modal"
    >
      <div className="go-kiosk-alert-modal">
        <div className="go-kiosk-alert-modal-icon" aria-hidden>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <p className="go-kiosk-alert-modal-eyebrow">Workplace alert</p>
        <h2 id="go-kiosk-alert-modal-title" className="go-kiosk-alert-modal-title">
          {alert.title}
        </h2>
        <p className="go-kiosk-alert-modal-body">{alert.body}</p>
        {alert.createdAt ? (
          <time className="go-kiosk-alert-modal-time" dateTime={alert.createdAt}>
            {formatAlertTime(alert.createdAt)}
          </time>
        ) : null}
        <button
          type="button"
          className="go-kiosk-alert-modal-ack"
          onClick={handleAcknowledge}
          data-testid="go-kiosk-alert-acknowledge"
        >
          Acknowledge alert
        </button>
        {alert.playSound ? (
          <p className="go-kiosk-alert-modal-hint">Sound repeats until you acknowledge this alert.</p>
        ) : null}
      </div>
    </div>
  );
}
