import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchGoWorkplaceAlerts, postGoDeviceCheckIn } from "../../lib/api";
import { clearGoLinkedWorkspace, defaultGoDeviceLabel, getGoDeviceId } from "../../lib/go-device";
import { initGoAlertSound } from "../../lib/go-alert-sound";
import { isGoDeviceUnlinkedError, GO_DEVICE_DISCONNECT_REDIRECT_MS } from "../../lib/go-session";
import { GoDeviceUnlinkedScreen } from "./GoDeviceUnlinkedScreen";

type Props = {
  hubToken: string;
  children: ReactNode;
};

type SessionPhase = "checking" | "ready" | "revoked";

const SESSION_POLL_MS = 8_000;

function redirectToLinkPage() {
  const target = `${window.location.origin}/aleniogo`;
  window.location.replace(target);
}

export function GoKioskSessionGate({ hubToken, children }: Props) {
  const [phase, setPhase] = useState<SessionPhase>("checking");

  const revokeSession = useCallback(() => {
    setPhase("revoked");
    clearGoLinkedWorkspace();
    window.setTimeout(redirectToLinkPage, GO_DEVICE_DISCONNECT_REDIRECT_MS);
  }, []);

  useEffect(() => {
    initGoAlertSound();
  }, []);

  useEffect(() => {
    if (!hubToken.trim()) {
      revokeSession();
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const result = await postGoDeviceCheckIn(
          hubToken,
          getGoDeviceId(),
          defaultGoDeviceLabel(),
        );
        if (cancelled) return;
        if (!result.approved) {
          revokeSession();
          return;
        }
        setPhase((current) => (current === "revoked" ? current : "ready"));
      } catch (err) {
        if (cancelled) return;
        if (isGoDeviceUnlinkedError(err)) {
          revokeSession();
        }
      }
    };

    const verifyAlerts = () => {
      void fetchGoWorkplaceAlerts(hubToken, getGoDeviceId()).catch((err) => {
        if (isGoDeviceUnlinkedError(err)) revokeSession();
      });
    };

    void verify();
    const sessionId = window.setInterval(() => void verify(), SESSION_POLL_MS);
    const alertId = window.setInterval(verifyAlerts, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(sessionId);
      window.clearInterval(alertId);
    };
  }, [hubToken, revokeSession]);

  if (phase === "revoked") {
    return <GoDeviceUnlinkedScreen />;
  }

  if (phase === "checking") {
    return <GoDeviceUnlinkedScreen checking />;
  }

  return <>{children}</>;
}
