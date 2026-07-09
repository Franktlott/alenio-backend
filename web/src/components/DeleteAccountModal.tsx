import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteApiAccount, fetchAccountDeletionReadiness, type AccountDeletionReadiness } from "../lib/api";

const IMPACT_ITEMS = [
  "You'll be removed from all your workspaces",
  "All your messages will be deleted",
  "Your task history will be removed",
  "This action cannot be undone",
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
};

export function DeleteAccountModal({ open, onClose, onDeleted }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<AccountDeletionReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const reset = () => {
    setStep(1);
    setPassword("");
    setShowPassword(false);
    setBusy(false);
    setError(null);
    setReadiness(null);
    setReadinessLoading(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReadinessLoading(true);
    void fetchAccountDeletionReadiness()
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        if (!cancelled) setReadiness({ canDelete: false, issues: [] });
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open) return null;

  const blockers = readiness?.issues.filter((issue) => issue.blocking) ?? [];
  const warnings = readiness?.issues.filter((issue) => !issue.blocking) ?? [];
  const canContinue = readiness?.canDelete === true && !readinessLoading;

  const onConfirmDelete = async () => {
    if (!password.trim()) {
      setError("Enter your password to confirm deletion.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteApiAccount(password);
      reset();
      await onDeleted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete account.";
      setError(msg === "Incorrect password" ? "Incorrect password. Please try again." : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="enterprise-profile-delete-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      data-testid="delete-account-modal"
    >
      <button type="button" className="enterprise-profile-delete-backdrop" aria-label="Close" onClick={close} disabled={busy} />
      <div className="enterprise-profile-delete-dialog">
        {step === 1 ? (
          <>
            <h3 id="delete-account-title" className="enterprise-profile-delete-title">
              Delete account?
            </h3>
            <ul className="enterprise-profile-delete-impact" data-testid="delete-account-impact">
              {IMPACT_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {readinessLoading ? <p className="enterprise-muted">Checking workspaces and billing…</p> : null}
            {!readinessLoading && blockers.length > 0 ? (
              <div className="enterprise-profile-delete-blockers" data-testid="delete-account-blockers">
                <p className="enterprise-profile-delete-blockers-title">Resolve these before deleting</p>
                <ul>
                  {blockers.map((issue) => (
                    <li key={`${issue.code}-${issue.teamId}`}>
                      <span>{issue.message}</span>
                      {issue.code === "active_web_billing" ? (
                        <Link
                          to={`/billing?teamId=${encodeURIComponent(issue.teamId)}`}
                          className="enterprise-profile-delete-action-link"
                          onClick={close}
                        >
                          Open billing
                        </Link>
                      ) : null}
                      {issue.code === "multi_member_owner" ? (
                        <Link to="/team" className="enterprise-profile-delete-action-link" onClick={close}>
                          Go to Team
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!readinessLoading && warnings.length > 0 ? (
              <div className="enterprise-profile-delete-warnings" data-testid="delete-account-warnings">
                <p className="enterprise-profile-delete-blockers-title">Before you continue</p>
                <ul>
                  {warnings.map((issue) => (
                    <li key={`${issue.code}-${issue.teamId}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="enterprise-profile-delete-actions">
              <button
                type="button"
                className="auth-submit enterprise-profile-delete-continue"
                onClick={() => setStep(2)}
                disabled={!canContinue}
                data-testid="delete-continue-step1"
              >
                Continue
              </button>
              <button type="button" className="auth-link-button" onClick={close}>
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h3 id="delete-account-title" className="enterprise-profile-delete-title">
              Confirm with your password
            </h3>
            <p className="enterprise-profile-delete-final-warning">
              This will permanently delete your account and all associated data. There is no way to recover it.
            </p>
            <label className="enterprise-muted enterprise-profile-delete-label" htmlFor="delete-account-password">
              Account password
            </label>
            <div className="enterprise-profile-delete-password-row">
              <input
                id="delete-account-password"
                type={showPassword ? "text" : "password"}
                className="auth-input"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.trim() && !busy) void onConfirmDelete();
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                data-testid="delete-password-input"
              />
              <button
                type="button"
                className="enterprise-profile-delete-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {error ? (
              <p className="enterprise-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="enterprise-profile-delete-actions">
              <button
                type="button"
                className="enterprise-team-btn-destructive enterprise-profile-delete-submit"
                disabled={busy || !password.trim()}
                onClick={() => void onConfirmDelete()}
                data-testid="confirm-delete-account"
              >
                {busy ? "Deleting…" : "Delete my account"}
              </button>
              <button
                type="button"
                className="auth-link-button"
                onClick={() => {
                  setPassword("");
                  setError(null);
                  setStep(1);
                }}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
