import { useEffect, useState, type FormEvent } from "react";
import { confirmEmailChange, requestEmailChange } from "../lib/api";

const OTP_MIN = 6;

type Props = {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  onChanged: (email: string) => void;
};

export function ChangeEmailModal({ open, currentEmail, onClose, onChanged }: Props) {
  const [step, setStep] = useState<"email" | "verify">("email");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const reset = () => {
    setStep("email");
    setNewEmail("");
    setOtp("");
    setBusy(false);
    setResendBusy(false);
    setError(null);
    setHint(null);
  };

  const close = () => {
    if (busy || resendBusy) return;
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !resendBusy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, resendBusy]);

  if (!open) return null;

  const normalizedNewEmail = newEmail.trim().toLowerCase();

  const onSendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    if (!normalizedNewEmail) {
      setError("Enter your new email address.");
      return;
    }
    if (normalizedNewEmail === currentEmail.trim().toLowerCase()) {
      setError("That is already your email address.");
      return;
    }
    setBusy(true);
    try {
      await requestEmailChange(normalizedNewEmail);
      setStep("verify");
      setHint(`We sent a verification code to ${normalizedNewEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (!normalizedNewEmail) return;
    setError(null);
    setHint(null);
    setResendBusy(true);
    try {
      await requestEmailChange(normalizedNewEmail);
      setHint(`We sent a new code to ${normalizedNewEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setResendBusy(false);
    }
  };

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    const code = otp.replace(/\D/g, "");
    if (code.length < OTP_MIN) {
      setError(`Enter the full code (at least ${OTP_MIN} digits).`);
      return;
    }
    setBusy(true);
    try {
      const updated = await confirmEmailChange(normalizedNewEmail, code);
      reset();
      onChanged(updated.email ?? normalizedNewEmail);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="enterprise-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-email-title"
      data-testid="change-email-modal"
      onClick={close}
    >
      <div className="enterprise-modal-panel enterprise-change-email-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="change-email-title" className="enterprise-modal-title">
          Change email
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">
          {step === "email"
            ? "Enter your new address. We will send a verification code there before updating your account."
            : `Enter the code sent to ${normalizedNewEmail}.`}
        </p>

        {step === "email" ? (
          <form onSubmit={(e) => void onSendCode(e)}>
            <label className="enterprise-muted enterprise-profile-label" htmlFor="change-email-current">
              Current email
            </label>
            <p className="enterprise-change-email-current" id="change-email-current">
              {currentEmail}
            </p>
            <label className="enterprise-muted enterprise-profile-label" htmlFor="change-email-new">
              New email
            </label>
            <input
              id="change-email-new"
              type="email"
              className="auth-input"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              disabled={busy}
              data-testid="change-email-input"
            />
            {error ? (
              <p className="enterprise-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button type="button" className="enterprise-profile-cancel-btn" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="enterprise-modal-primary-btn" disabled={busy}>
                {busy ? "Sending…" : "Send verification code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void onConfirm(e)}>
            <label className="enterprise-muted enterprise-profile-label" htmlFor="change-email-otp">
              Verification code
            </label>
            <input
              id="change-email-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="auth-input enterprise-change-email-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="6-digit code"
              disabled={busy}
              data-testid="change-email-otp"
            />
            {hint ? <p className="enterprise-muted enterprise-change-email-hint">{hint}</p> : null}
            {error ? (
              <p className="enterprise-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button
                type="button"
                className="enterprise-profile-cancel-btn"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError(null);
                  setHint(null);
                }}
                disabled={busy || resendBusy}
              >
                Back
              </button>
              <button
                type="button"
                className="enterprise-profile-cancel-btn"
                onClick={() => void onResend()}
                disabled={busy || resendBusy}
              >
                {resendBusy ? "Sending…" : "Resend code"}
              </button>
              <button type="submit" className="enterprise-modal-primary-btn" disabled={busy}>
                {busy ? "Updating…" : "Confirm new email"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
