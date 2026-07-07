import { useEffect, useRef, useState } from "react";
import type { GoWorkplaceAlert } from "../../lib/api";
import {
  hasGoAlertSoundPreference,
  isGoAlertSoundUnlocked,
  onGoAlertSoundUnlocked,
  startGoAlertSoundLoop,
  stopGoAlertSoundLoop,
  unlockGoAlertSound,
  unlockGoAlertSoundFromGesture,
} from "../../lib/go-alert-sound";
import { ALENIO_ALERT_SOUND_PATH, resolveWorkplaceAlertSoundUrl } from "../../lib/go-alert-sounds";

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

export function GoAlertSoundUnlockBanner() {
  const [state, setState] = useState<"idle" | "enabling" | "error" | "done">(() => {
    if (isGoAlertSoundUnlocked() || hasGoAlertSoundPreference()) return "done";
    return "idle";
  });

  useEffect(() => onGoAlertSoundUnlocked(() => setState("done")), []);

  if (state === "done") return null;

  function enableSound() {
    setState("enabling");
    const ok = unlockGoAlertSoundFromGesture(ALENIO_ALERT_SOUND_PATH);
    if (ok) {
      setState("done");
      return;
    }
    void unlockGoAlertSound(ALENIO_ALERT_SOUND_PATH).then((asyncOk) => setState(asyncOk ? "done" : "error"));
  }

  return (
    <section className="go-alert-sound-setup" aria-labelledby="go-alert-sound-setup-title">
      <div className="go-alert-sound-setup-card">
        <div className="go-alert-sound-setup-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className="go-alert-sound-setup-copy">
          <p className="go-alert-sound-setup-kicker">Device setup</p>
          <h2 id="go-alert-sound-setup-title" className="go-alert-sound-setup-title">
            Enable alert audio
          </h2>
          <p className="go-alert-sound-setup-sub">
            Turn on once so workplace alerts can play sound on this tablet.
          </p>
        </div>
        <button
          type="button"
          className="go-alert-sound-setup-btn"
          disabled={state === "enabling"}
          onPointerUp={(event) => {
            event.preventDefault();
            enableSound();
          }}
          data-testid="go-alert-sound-unlock"
        >
          {state === "enabling" ? "Enabling…" : state === "error" ? "Try again" : "Enable audio"}
        </button>
      </div>
      {state === "error" ? (
        <p className="go-alert-sound-setup-error" role="alert">
          Could not enable audio. Raise the device volume and tap Enable audio again.
        </p>
      ) : null}
    </section>
  );
}

export function GoKioskAlertModal({ alert, onAcknowledge }: ModalProps) {
  const [soundBlocked, setSoundBlocked] = useState(false);
  const soundUrl = resolveWorkplaceAlertSoundUrl(alert);

  useEffect(() => {
    if (!soundUrl) {
      setSoundBlocked(false);
      return;
    }
    if (!isGoAlertSoundUnlocked()) {
      setSoundBlocked(true);
      startGoAlertSoundLoop(soundUrl);
      return;
    }
    startGoAlertSoundLoop(soundUrl);
    setSoundBlocked(false);
    return () => stopGoAlertSoundLoop();
  }, [alert.id, alert.playSound, alert.soundUrl, soundUrl]);

  useEffect(() => {
    if (!soundUrl) return;
    return onGoAlertSoundUnlocked(() => {
      setSoundBlocked(false);
      startGoAlertSoundLoop(soundUrl);
    });
  }, [alert.id, alert.playSound, alert.soundUrl, soundUrl]);

  function handleAcknowledge(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    stopGoAlertSoundLoop();
    onAcknowledge();
  }

  function handleUnlockSound() {
    if (!soundBlocked) return;

    if (unlockGoAlertSoundFromGesture(soundUrl)) {
      setSoundBlocked(false);
      if (soundUrl) startGoAlertSoundLoop(soundUrl);
      return;
    }
    void unlockGoAlertSound(soundUrl).then((ok) => {
      if (!ok) return;
      setSoundBlocked(false);
      if (soundUrl) startGoAlertSoundLoop(soundUrl);
    });
  }

  return (
    <div
      className="go-kiosk-alert-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="go-kiosk-alert-modal-title"
      data-testid="go-kiosk-alert-modal"
      onPointerUp={(event) => {
        if (event.target !== event.currentTarget) return;
        handleUnlockSound();
      }}
    >
      <div
        className="go-kiosk-alert-modal"
        onPointerUp={(event) => event.stopPropagation()}
      >
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
          onPointerUp={(event) => event.stopPropagation()}
          data-testid="go-kiosk-alert-acknowledge"
        >
          Acknowledge alert
        </button>
        {alert.playSound ? (
          <p className="go-kiosk-alert-modal-hint">
            {soundBlocked
              ? "Tap anywhere on this alert to enable sound. It repeats until you acknowledge."
              : "Sound repeats until you acknowledge this alert."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
