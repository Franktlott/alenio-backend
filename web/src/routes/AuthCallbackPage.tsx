import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AuthLoadingScreen,
  SSO_AUTH_LOADING_STEPS,
} from "../components/AuthLoadingScreen";
import {
  ensureWebSessionAndToken,
  syncBackendUser,
} from "../lib/auth-client";
import { setStoredToken } from "../lib/token";
import { finishPostAuthNavigation } from "../lib/invite-auth";
import { formatAuthFlowError } from "../lib/auth-errors";

const STEP_MS = 1600;
const EXIT_HOLD_MS = 700;

function readAuthTokenFromHash(): string | null {
  try {
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(raw);
    const fromHash = params.get("auth_token")?.trim();
    if (fromHash) return fromHash;
    const q = new URLSearchParams(window.location.search);
    return q.get("auth_token")?.trim() || q.get("token")?.trim() || null;
  } catch {
    return null;
  }
}

function readOAuthError(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const err = q.get("error")?.trim();
    if (err) {
      const desc = q.get("error_description")?.trim();
      return desc ? `${err}: ${desc}` : err;
    }
    if (q.get("state") === "state_not_found") {
      return "Microsoft sign-in expired or was interrupted. Please try again.";
    }
    return null;
  } catch {
    return null;
  }
}

/** Completes Microsoft OAuth with a premium full-screen workspace boot experience. */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [exiting, setExiting] = useState(false);

  const title = useMemo(
    () => (error ? "Sign-in issue" : "Connecting your workspace"),
    [error],
  );

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const run = async () => {
      const oauthError = readOAuthError();
      if (oauthError) {
        if (!cancelled) setError(oauthError);
        return;
      }

      const token = readAuthTokenFromHash();
      if (!token) {
        if (!cancelled) {
          setError("Sign-in did not return a session. Try again with Microsoft, or use email and password.");
        }
        return;
      }

      setStoredToken(token);
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        /* ignore */
      }

      const stepsPromise = new Promise<void>((resolve) => {
        SSO_AUTH_LOADING_STEPS.forEach((_, index) => {
          if (index === 0) return;
          timers.push(
            window.setTimeout(() => {
              if (!cancelled) setActiveIndex(index);
            }, STEP_MS * index),
          );
        });
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) setAllDone(true);
            resolve();
          }, STEP_MS * SSO_AUTH_LOADING_STEPS.length),
        );
      });

      try {
        const [, ready] = await Promise.all([
          stepsPromise,
          ensureWebSessionAndToken(),
        ]);
        if (cancelled) return;
        if (!ready) {
          setError("Could not verify your Microsoft session. Try again.");
          return;
        }
        await syncBackendUser();
        if (cancelled) return;
        setAllDone(true);
        setExiting(true);
        await new Promise((r) => setTimeout(r, EXIT_HOLD_MS));
        if (cancelled) return;
        const dest = await finishPostAuthNavigation();
        if (!cancelled) window.location.href = dest;
      } catch (err) {
        if (!cancelled) setError(formatAuthFlowError(err));
      }
    };

    void run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [navigate]);

  return (
    <AuthLoadingScreen
      title={title}
      subtitle={
        error
          ? "We could not finish connecting your Microsoft account."
          : "Securely signing you in with Microsoft"
      }
      steps={SSO_AUTH_LOADING_STEPS}
      activeIndex={activeIndex}
      allDone={allDone}
      exiting={exiting}
      error={error}
      testId="auth-callback-screen"
      errorActions={
        <Link
          to="/login"
          className="auth-btn-primary"
          style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
        >
          Back to sign in
        </Link>
      }
    />
  );
}
