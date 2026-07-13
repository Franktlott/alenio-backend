import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ensureWebSessionAndToken,
  syncBackendUser,
} from "../lib/auth-client";
import { setStoredToken } from "../lib/token";
import { finishPostAuthNavigation } from "../lib/invite-auth";
import { formatAuthFlowError } from "../lib/auth-errors";

const STEPS = [
  { id: "authenticating", title: "Authenticating with Microsoft", icon: "lock" },
  { id: "loading_workspace", title: "Loading your workplace", icon: "users" },
  { id: "syncing_team", title: "Syncing your team", icon: "sync" },
  { id: "preparing_dashboard", title: "Preparing your dashboard", icon: "dashboard" },
] as const;

const STEP_MS = 780;

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

function StepIcon({ name }: { name: (typeof STEPS)[number]["icon"] }) {
  if (name === "lock") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="#4361EE" strokeWidth="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#4361EE" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="9" cy="8" r="3" stroke="#4361EE" strokeWidth="2" />
        <circle cx="17" cy="9" r="2.5" stroke="#4361EE" strokeWidth="2" />
        <path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke="#4361EE" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "sync") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M21 12a9 9 0 1 1-2.6-6.3" stroke="#4361EE" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 3v6h-6" stroke="#4361EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="#4361EE" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="#4361EE" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="#4361EE" strokeWidth="2" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="#4361EE" strokeWidth="2" />
    </svg>
  );
}

function statusFor(index: number, activeIndex: number, allDone: boolean) {
  if (allDone || index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
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
        STEPS.forEach((_, index) => {
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
          }, STEP_MS * STEPS.length),
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
        await new Promise((r) => setTimeout(r, 250));
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
    <div
      className={`auth-loading-screen${exiting && !error ? " auth-loading-screen--exit" : ""}`}
      data-testid="auth-callback-screen"
    >
      <div className="auth-loading-glow" aria-hidden />
      <div className="auth-loading-inner">
        <img src="/alenio-logo.png" alt="Alenio" className="auth-loading-logo" />
        <h1 className="auth-loading-title">{title}</h1>
        <p className="auth-loading-subtitle">
          {error
            ? "We could not finish connecting your Microsoft account."
            : "Securely signing you in with Microsoft"}
        </p>

        {error ? (
          <div className="auth-loading-error-card">
            <p className="auth-error" data-testid="auth-callback-error">
              {error}
            </p>
            <Link to="/login" className="auth-btn-primary" style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="auth-loading-hero-wrap">
              <img
                src="/auth-loading-hero.png"
                alt=""
                className="auth-loading-hero"
              />
              <div className="auth-loading-float auth-loading-float--tasks">
                <strong>Tasks</strong>
                <span>Opening checklist</span>
                <div className="auth-loading-bar">
                  <i />
                </div>
              </div>
              <div className="auth-loading-float auth-loading-float--team">
                <strong>Team Update</strong>
                <span>Great job team! Sales goal achieved today!</span>
              </div>
              <div className="auth-loading-float auth-loading-float--cal">
                <strong>1:1 with Taylor</strong>
                <span>Today at 2:00 PM</span>
              </div>
            </div>

            <div className="auth-loading-progress" data-testid="auth-callback-loading">
              {STEPS.map((step, index) => {
                const status = statusFor(index, activeIndex, allDone);
                return (
                  <div key={step.id} className={`auth-loading-step auth-loading-step--${status}`}>
                    <span className="auth-loading-step-icon">
                      <StepIcon name={step.icon} />
                    </span>
                    <span className="auth-loading-step-title">{step.title}</span>
                    <span className="auth-loading-step-status" aria-hidden>
                      {status === "done" ? "✓" : status === "active" ? "" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="auth-loading-footer">
          <span aria-hidden>🛡</span> Your data is secure and encrypted
        </p>
      </div>
    </div>
  );
}
