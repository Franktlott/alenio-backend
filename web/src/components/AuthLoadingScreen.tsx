import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type AuthLoadingStepDef = {
  id: string;
  title: string;
  icon: "lock" | "users" | "sync" | "dashboard";
};

export const SSO_AUTH_LOADING_STEPS: AuthLoadingStepDef[] = [
  { id: "authenticating", title: "Authenticating with Microsoft", icon: "lock" },
  { id: "loading_workspace", title: "Loading your workplace", icon: "users" },
  { id: "syncing_team", title: "Syncing your team", icon: "sync" },
  { id: "preparing_dashboard", title: "Preparing your dashboard", icon: "dashboard" },
];

export const ENTERPRISE_WORKSPACE_LOADING_STEPS: AuthLoadingStepDef[] = [
  { id: "opening_workspace", title: "Opening workspace", icon: "lock" },
  { id: "loading_workspace", title: "Loading your workplace", icon: "users" },
  { id: "syncing_modules", title: "Syncing allowed modules", icon: "sync" },
  { id: "preparing_tabs", title: "Preparing navigation", icon: "dashboard" },
];

function StepIcon({ name }: { name: AuthLoadingStepDef["icon"] }) {
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

export type AuthLoadingScreenProps = {
  title: string;
  subtitle: string;
  steps?: AuthLoadingStepDef[];
  activeIndex?: number;
  allDone?: boolean;
  exiting?: boolean;
  overlay?: boolean;
  error?: string | null;
  errorActions?: ReactNode;
  testId?: string;
};

/** Premium full-screen boot UI shared by Microsoft SSO and enterprise workspace opens. */
export function AuthLoadingScreen({
  title,
  subtitle,
  steps = SSO_AUTH_LOADING_STEPS,
  activeIndex = 0,
  allDone = false,
  exiting = false,
  overlay = false,
  error = null,
  errorActions,
  testId = "auth-loading-screen",
}: AuthLoadingScreenProps) {
  const classes = [
    "auth-loading-screen",
    overlay ? "auth-loading-screen--overlay" : "",
    exiting && !error ? "auth-loading-screen--exit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-busy={!error && !allDone}
    >
      <div className="auth-loading-glow" aria-hidden />
      <div className="auth-loading-inner">
        <img src="/alenio-logo.png" alt="Alenio" className="auth-loading-logo" />
        <h1 className="auth-loading-title">{title}</h1>
        <p className="auth-loading-subtitle">{subtitle}</p>

        {error ? (
          <div className="auth-loading-error-card">
            <p className="auth-error">{error}</p>
            {errorActions ?? (
              <Link
                to="/login"
                className="auth-btn-primary"
                style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
              >
                Back to sign in
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="auth-loading-hero-wrap">
              <img src="/auth-loading-hero.png" alt="" className="auth-loading-hero" />
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

            <div className="auth-loading-progress">
              {steps.map((step, index) => {
                const status = statusFor(index, activeIndex, allDone);
                return (
                  <div key={step.id} className={`auth-loading-step auth-loading-step--${status}`}>
                    <span className="auth-loading-step-icon">
                      <StepIcon name={step.icon} />
                    </span>
                    <span className="auth-loading-step-title">{step.title}</span>
                    <span className="auth-loading-step-status" aria-hidden>
                      {status === "done" ? "✓" : ""}
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
