import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearAccessToken, getAccessToken, getAuthClient } from "../lib/auth-client";
import { isSessionTokenUsable } from "../lib/token";

const IDLE_MS = 5 * 60 * 1000;
const WARNING_SECONDS = 5 * 60;
const TICK_MS = 1000;

/** Marketing and auth routes — no idle sign-out prompt while browsing these. */
const PUBLIC_PATHS = new Set([
  "/",
  "/pricing",
  "/privacy",
  "/terms",
  "/account-deletion",
  "/login",
  "/sign-up",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/reset-password/verify",
]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function formatCountdown(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sessionEndDeadline(lastActivityMs: number): number {
  return lastActivityMs + IDLE_MS + WARNING_SECONDS * 1000;
}

function warningRemainingSec(deadlineMs: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}

function stripSessionTitlePrefix(title: string): string {
  return title.replace(/^\(\d+:\d+\)\s*Session ending —\s*/i, "");
}

function maybeNotifySessionWarning(remainingSec: number): void {
  if (!document.hidden) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const notification = new Notification("Alenio session ending", {
      body: `You will be signed out in ${formatCountdown(remainingSec)}. Return to the app to extend your session.`,
      tag: "alenio-session-idle",
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* ignore — notifications unavailable */
  }
}

export function SessionIdleGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const lastMouseMoveRef = useRef(0);
  const warningOpenRef = useRef(false);
  const signingOutRef = useRef(false);
  const sessionEndDeadlineRef = useRef(0);
  const idleNotifiedRef = useRef(false);
  const baseTitleRef = useRef(typeof document !== "undefined" ? stripSessionTitlePrefix(document.title) : "Alenio");

  const [warningOpen, setWarningOpen] = useState(false);
  const [countdownSec, setCountdownSec] = useState(WARNING_SECONDS);

  const hasSession = isSessionTokenUsable(getAccessToken());
  const guardActive = hasSession && !isPublicPath(location.pathname);

  const restoreTitle = useCallback(() => {
    document.title = baseTitleRef.current;
  }, []);

  const updateHiddenTitle = useCallback((remainingSec: number) => {
    if (!document.hidden) return;
    document.title = `(${formatCountdown(remainingSec)}) Session ending — ${baseTitleRef.current}`;
  }, []);

  const bumpActivity = useCallback(() => {
    if (warningOpenRef.current) return;
    lastActivityRef.current = Date.now();
  }, []);

  const performSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    warningOpenRef.current = false;
    idleNotifiedRef.current = false;
    setWarningOpen(false);
    restoreTitle();
    try {
      try {
        await getAuthClient().signOut();
      } catch {
        /* ignore */
      }
      clearAccessToken();
      navigate("/login?reason=session", { replace: true });
    } finally {
      signingOutRef.current = false;
    }
  }, [navigate, restoreTitle]);

  const openWarning = useCallback(
    (remainingSec: number) => {
      warningOpenRef.current = true;
      setWarningOpen(true);
      setCountdownSec(remainingSec);
      updateHiddenTitle(remainingSec);
      if (document.hidden && !idleNotifiedRef.current) {
        idleNotifiedRef.current = true;
        maybeNotifySessionWarning(remainingSec);
      }
    },
    [updateHiddenTitle],
  );

  const closeWarning = useCallback(() => {
    warningOpenRef.current = false;
    idleNotifiedRef.current = false;
    setWarningOpen(false);
    setCountdownSec(WARNING_SECONDS);
    restoreTitle();
  }, [restoreTitle]);

  const onExtend = useCallback(() => {
    closeWarning();
    lastActivityRef.current = Date.now();
    sessionEndDeadlineRef.current = 0;
  }, [closeWarning]);

  const syncSessionState = useCallback(() => {
    if (signingOutRef.current || !guardActive) return;
    if (!isSessionTokenUsable(getAccessToken())) {
      closeWarning();
      return;
    }

    const now = Date.now();
    const deadline = sessionEndDeadline(lastActivityRef.current);
    sessionEndDeadlineRef.current = deadline;
    const idleForMs = now - lastActivityRef.current;

    if (idleForMs >= IDLE_MS + WARNING_SECONDS * 1000) {
      void performSignOut();
      return;
    }

    if (idleForMs >= IDLE_MS) {
      const remaining = warningRemainingSec(deadline, now);
      if (remaining <= 0) {
        void performSignOut();
        return;
      }
      if (!warningOpenRef.current) {
        openWarning(remaining);
      } else {
        setCountdownSec(remaining);
        updateHiddenTitle(remaining);
      }
      return;
    }

    if (warningOpenRef.current) {
      closeWarning();
    }
  }, [closeWarning, guardActive, openWarning, performSignOut, updateHiddenTitle]);

  useEffect(() => {
    warningOpenRef.current = warningOpen;
  }, [warningOpen]);

  useEffect(() => {
    if (!guardActive) {
      closeWarning();
      return;
    }
    lastActivityRef.current = Date.now();
    sessionEndDeadlineRef.current = 0;
  }, [guardActive, closeWarning, location.pathname]);

  useEffect(() => {
    if (!guardActive) return;

    const onMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveRef.current < 10_000) return;
      lastMouseMoveRef.current = now;
      bumpActivity();
    };

    const onActivity = () => bumpActivity();

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("click", onActivity);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("click", onActivity);
    };
  }, [guardActive, bumpActivity]);

  useEffect(() => {
    if (!guardActive) return;

    syncSessionState();

    const id = window.setInterval(syncSessionState, TICK_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncSessionState();
        if (!warningOpenRef.current) restoreTitle();
        return;
      }
      if (warningOpenRef.current) {
        updateHiddenTitle(warningRemainingSec(sessionEndDeadlineRef.current));
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      restoreTitle();
    };
  }, [guardActive, restoreTitle, syncSessionState, updateHiddenTitle]);

  useEffect(() => {
    if (!warningOpen || !document.hidden) return;
    updateHiddenTitle(countdownSec);
  }, [warningOpen, countdownSec, updateHiddenTitle]);

  if (!guardActive || !warningOpen) return null;

  return (
    <div className="session-idle-backdrop" role="presentation" data-testid="session-idle-modal">
      <div
        className="session-idle-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-idle-title"
        aria-describedby="session-idle-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="session-idle-title" className="session-idle-title">
          Session ending in {formatCountdown(countdownSec)}
        </h2>
        <p id="session-idle-desc" className="session-idle-desc">
          You have been inactive. Extend to stay signed in, or sign out now.
        </p>
        <div className="session-idle-actions">
          <button type="button" className="session-idle-btn session-idle-btn-primary" onClick={onExtend} data-testid="session-idle-extend">
            Extend session
          </button>
          <button type="button" className="session-idle-btn session-idle-btn-secondary" onClick={() => void performSignOut()} data-testid="session-idle-sign-out">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
