import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthPasswordFlowClient } from "../lib/auth-client";
import { formatAuthFlowError } from "../lib/auth-errors";

function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3 4.5 6.5v5.2c0 4.6 3.2 8.7 7.5 9.8 4.3-1.1 7.5-5.2 7.5-9.8V6.5L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9 2 2-2 2-2-1-2 2" />
    </svg>
  );
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const result = await getAuthPasswordFlowClient().forgetPassword.emailOtp({
        email: emailNorm,
      });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Try again.");
        return;
      }
      navigate(`/reset-password/verify?email=${encodeURIComponent(emailNorm)}`, { replace: true });
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-ent-shell auth-ent-shell--forgot" data-testid="forgot-password-screen">
      <aside className="auth-ent-brand" aria-hidden={false}>
        <div className="auth-ent-brand-top">
          <Link to="/" className="auth-ent-brand-mark" aria-label="Alenio home">
            <img src="/alenio-mark-icon.svg" alt="" width={36} height={36} />
            <span>Alenio</span>
          </Link>
          <Link to="/" className="auth-ent-brand-back">
            ← Website
          </Link>
        </div>

        <div className="auth-ent-brand-body">
          <p className="auth-ent-brand-eyebrow">Account recovery</p>
          <h1 className="auth-ent-brand-title">
            Secure access,
            <span> restored in minutes.</span>
          </h1>
          <p className="auth-ent-brand-copy">
            Reset your Alenio password with a one-time email code. Built for teams that need reliable, enterprise-grade
            account security.
          </p>

          <div className="auth-ent-brand-visual">
            <img
              src="/auth-loading-hero.png"
              alt=""
              className="auth-ent-brand-hero"
            />
            <div className="auth-ent-brand-glow" aria-hidden />
          </div>

          <ul className="auth-ent-brand-points">
            <li>
              <span className="auth-ent-brand-point-icon">
                <IconShield />
              </span>
              <div>
                <strong>Verified reset</strong>
                <span>Codes expire quickly and only work for your account email.</span>
              </div>
            </li>
            <li>
              <span className="auth-ent-brand-point-icon">
                <IconMail />
              </span>
              <div>
                <strong>Work email only</strong>
                <span>Use the same address you sign in with on web or mobile.</span>
              </div>
            </li>
            <li>
              <span className="auth-ent-brand-point-icon">
                <IconKey />
              </span>
              <div>
                <strong>Microsoft accounts</strong>
                <span>If you only use Microsoft, sign in with Microsoft instead.</span>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-ent-main">
        <div className="auth-ent-card">
          <div className="auth-ent-card-brand">
            <img src="/icon.png" alt="" width={40} height={40} className="auth-ent-card-logo" />
            <div>
              <p className="auth-ent-card-product">Alenio Enterprise</p>
              <p className="auth-ent-card-meta">Password recovery</p>
            </div>
          </div>

          <ol className="auth-ent-steps" aria-label="Recovery steps">
            <li className="is-current">
              <span>1</span> Email
            </li>
            <li>
              <span>2</span> Verify
            </li>
            <li>
              <span>3</span> New password
            </li>
          </ol>

          <header className="auth-ent-card-head">
            <h2 className="auth-ent-card-title">Forgot your password?</h2>
            <p className="auth-ent-card-sub">
              Enter your work email and we&apos;ll send a reset code if an Alenio password account exists for that
              address.
            </p>
          </header>

          <form className="auth-ent-form" onSubmit={onSubmit}>
            <label className="auth-label" htmlFor="forgot-email">
              Work email
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              className="auth-input auth-ent-input"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="forgot-password-email"
            />
            {error ? (
              <p className="auth-error" data-testid="forgot-password-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="auth-btn-primary auth-ent-submit" disabled={loading} data-testid="forgot-password-submit">
              {loading ? "Sending code…" : "Send reset code"}
            </button>
          </form>

          <div className="auth-ent-card-footer">
            <Link to="/login" className="auth-v2-inline-link" data-testid="forgot-password-back-login">
              ← Back to sign in
            </Link>
            <p className="auth-ent-help">
              Need help?{" "}
              <a href="mailto:support@alenio.com" className="auth-v2-inline-link">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
