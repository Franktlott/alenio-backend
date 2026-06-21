import { useCallback, useEffect, useState } from "react";
import {
  canRequestFullscreen,
  dismissKioskInstallHint,
  enterKioskFullscreen,
  isIosTabletOrPhone,
  isKioskInstallDismissed,
  isKioskStandalone,
  mountChecklistWebManifest,
} from "../../../lib/kiosk-display";

type Props = {
  teamName?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function KioskInstallBar({ teamName }: Props) {
  useEffect(() => {
    mountChecklistWebManifest();
  }, []);

  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [fullscreenBusy, setFullscreenBusy] = useState(false);

  useEffect(() => {
    if (isKioskStandalone() || isKioskInstallDismissed()) return;
    setVisible(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    dismissKioskInstallHint();
    setVisible(false);
  }, []);

  const onInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    dismiss();
  }, [dismiss, installEvent]);

  const onFullscreen = useCallback(async () => {
    setFullscreenBusy(true);
    try {
      await enterKioskFullscreen();
    } finally {
      setFullscreenBusy(false);
    }
  }, []);

  if (!visible) return null;

  const ios = isIosTabletOrPhone();
  const showFullscreen = canRequestFullscreen();

  return (
    <div className="kiosk-install-bar" role="region" aria-label="Install checklist app">
      <div className="kiosk-install-bar__content">
        <p className="kiosk-install-bar__title">Run full screen on this iPad</p>
        <p className="kiosk-install-bar__text">
          {ios ? (
            <>
              Tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>
              {teamName ? ` for ${teamName}` : ""}. Opens like an app with no browser bar.
            </>
          ) : installEvent ? (
            <>Install Alenio Checklists on this device for a kiosk-style full-screen experience.</>
          ) : (
            <>Add this page to your home screen or use full screen for a cleaner kiosk view.</>
          )}
        </p>
        <div className="kiosk-install-bar__actions">
          {installEvent ? (
            <button type="button" className="kiosk-install-bar__btn kiosk-install-bar__btn--primary" onClick={() => void onInstall()}>
              Install app
            </button>
          ) : null}
          {showFullscreen ? (
            <button
              type="button"
              className="kiosk-install-bar__btn"
              disabled={fullscreenBusy}
              onClick={() => void onFullscreen()}
            >
              {fullscreenBusy ? "Opening…" : "Full screen"}
            </button>
          ) : null}
          <button type="button" className="kiosk-install-bar__btn kiosk-install-bar__btn--ghost" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
