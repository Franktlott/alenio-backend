import { type FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAuthPasswordFlowClient } from "../lib/auth-client";
import { formatAuthFlowError } from "../lib/auth-errors";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);
  const email = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const otp = useMemo(() => (params.get("otp") ?? "").replace(/\D/g, ""), [params]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const linkFlow = Boolean(token);
  const otpFlow = Boolean(email && otp.length >= 6);

  if (!linkFlow && !otpFlow) {
    return (
      <div className="auth-v2-shell" data-testid="reset-password-missing-params">
        <section className="auth-v2-hero">
          <div className="auth-v2-hero-inner">
            <Link to="/" className="auth-v2-back-site">
              ← Back to website
            </Link>
            <h1 className="auth-v2-hero-title">Reset link invalid</h1>
            <p className="auth-v2-hero-copy">Request a new code or open the reset link from your email.</p>
          </div>
        </section>
        <main className="auth-v2-main">
          <div className="auth-v2-card">
            <p className="auth-sub">This page needs a reset token from email, or an email and code from the previous step.</p>
            <p className="auth-v2-footnote">
              <Link to="/forgot-password" className="auth-v2-inline-link">
                Forgot password
              </Link>
              {" · "}
              <Link to="/login" className="auth-v2-inline-link">
                Sign in
              </Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPassword) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      if (linkFlow) {
        const result = await getAuthPasswordFlowClient().resetPassword({
          newPassword,
          token,
        });
        if (result.error) {
          setError(result.error.message ?? "Reset failed. The link may have expired.");
          return;
        }
        setSuccess(true);
        return;
      }

      const otpResult = await getAuthPasswordFlowClient().emailOtp.resetPassword({
        email: email!,
        otp,
        password: newPassword,
      });
      if (otpResult.error) {
        setError(otpResult.error.message ?? "Reset failed. Check your code and try again.");
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-v2-shell" data-testid="reset-password-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            New password.
            <br />
            <span>Choose something strong.</span>
          </h1>
          <p className="auth-v2-hero-copy">You will sign in with this password on web and mobile.</p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Reset password</p>
            <h2 className="auth-heading">{success ? "All set" : "Choose a new password"}</h2>
            {!success && email ? (
              <p className="auth-sub">
                Resetting password for <strong>{email}</strong>
              </p>
            ) : null}
          </div>
          {success ? (
            <>
              <p className="auth-hint" data-testid="reset-password-success">
                Your password was updated. Sign in with your new password.
              </p>
              <Link to="/login" className="auth-btn-primary" style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }} data-testid="reset-password-go-login">
                Go to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <label className="auth-label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                className="auth-input"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="reset-new-password"
              />
              <label className="auth-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                className="auth-input"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="reset-confirm-password"
              />
              {error ? (
                <p className="auth-error" data-testid="reset-password-error">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="reset-password-submit">
                {loading ? "Saving…" : "Reset password"}
              </button>
            </form>
          )}
          {!success ? (
            <p className="auth-v2-footnote">
              <Link to="/login" className="auth-v2-inline-link">
                Back to sign in
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
