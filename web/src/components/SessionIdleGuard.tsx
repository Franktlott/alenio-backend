import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearAccessToken, getAccessToken, getAuthClient } from "../lib/auth-client";
import { looksLikeJwt } from "../lib/token";

const IDLE_MS = 5 * 60 * 1000;
const WARNING_SECONDS = 5 * 60;

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

export function SessionIdleGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const lastMouseMoveRef = useRef(0);
  const warningOpenRef = useRef(false);
  const signingOutRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(false);
  const [countdownSec, setCountdownSec] = useState(WARNING_SECONDS);

  const hasSession = looksLikeJwt(getAccessToken() ?? "");
  const guardActive = hasSession && !isPublicPath(location.pathname);

  const bumpActivity = useCallback(() => {
    if (warningOpenRef.current) return;
    lastActivityRef.current = Date.now();
  }, []);

  const performSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    warningOpenRef.current = false;
    setWarningOpen(false);
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
  }, [navigate]);

  const onExtend = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    lastActivityRef.current = Date.now();
    setCountdownSec(WARNING_SECONDS);
  }, []);

  useEffect(() => {
    warningOpenRef.current = warningOpen;
  }, [warningOpen]);

  useEffect(() => {
    if (!guardActive) {
      warningOpenRef.current = false;
      setWarningOpen(false);
      setCountdownSec(WARNING_SECONDS);
      return;
    }
    lastActivityRef.current = Date.now();
  }, [guardActive, location.pathname]);

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

    const id = window.setInterval(() => {
      if (signingOutRef.current) return;
      if (!looksLikeJwt(getAccessToken() ?? "")) {
        warningOpenRef.current = false;
        setWarningOpen(false);
        return;
      }

      if (warningOpenRef.current) {
        setCountdownSec((c) => {
          if (c <= 1) {
            void performSignOut();
            return 0;
          }
          return c - 1;
        });
        return;
      }

      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        warningOpenRef.current = true;
        setWarningOpen(true);
        setCountdownSec(WARNING_SECONDS);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [guardActive, performSignOut]);

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
