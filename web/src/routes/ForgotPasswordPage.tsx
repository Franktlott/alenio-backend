import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAuthPasswordFlowClient } from "../lib/auth-client";
import { formatAuthFlowError } from "../lib/auth-errors";

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
    <div className="auth-v2-shell" data-testid="forgot-password-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            Reset your password.
            <br />
            <span>We will email you a code.</span>
          </h1>
          <p className="auth-v2-hero-copy">Use the same email as your Alenio account. You will enter the code on the next step.</p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Forgot password</p>
            <h2 className="auth-heading">Request a reset code</h2>
            <p className="auth-sub">
              Enter the email for your Alenio password account. If that account exists, we email a code. Microsoft-only
              accounts should use Continue with Microsoft on the sign-in page instead.
            </p>
          </div>
          <form onSubmit={onSubmit}>
            <label className="auth-label" htmlFor="forgot-email">
              Email address
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              className="auth-input"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="forgot-password-email"
            />
            {error ? (
              <p className="auth-error" data-testid="forgot-password-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="forgot-password-submit">
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
          <p className="auth-v2-footnote">
            <Link to="/login" className="auth-v2-inline-link" data-testid="forgot-password-back-login">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
