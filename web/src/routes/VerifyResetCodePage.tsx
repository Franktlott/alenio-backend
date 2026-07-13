import { type FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getAuthPasswordFlowClient } from "../lib/auth-client";
import { formatAuthFlowError } from "../lib/auth-errors";

const OTP_MIN = 6;

export function VerifyResetCodePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!email) {
    return <Navigate to="/forgot-password" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = otp.replace(/\D/g, "");
    if (code.length < OTP_MIN) {
      setError(`Enter the full code (at least ${OTP_MIN} digits).`);
      return;
    }
    setLoading(true);
    try {
      const check = await getAuthPasswordFlowClient().emailOtp.checkVerificationOtp({
        email,
        otp: code,
        type: "forget-password",
      });
      if (check.error) {
        setError(check.error.message ?? "Invalid code. Try again.");
        return;
      }
      navigate(`/reset-password?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(code)}`, { replace: true });
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-v2-shell" data-testid="verify-reset-code-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            Check your inbox.
            <br />
            <span>Enter the reset code.</span>
          </h1>
          <p className="auth-v2-hero-copy">
            If an Alenio password account exists for that email, the code is in your inbox (and sometimes spam).
            Microsoft-only accounts should sign in with Microsoft instead.
          </p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Verify code</p>
            <h2 className="auth-heading">Enter reset code</h2>
            <p className="auth-sub">
              If we found an account for <strong>{email}</strong>, check that inbox (and spam) for the code.
            </p>
          </div>
          <form onSubmit={onSubmit}>
            <label className="auth-label" htmlFor="reset-otp">
              Reset code
            </label>
            <input
              id="reset-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="auth-input"
              style={{ letterSpacing: "0.2em", fontSize: "1.125rem" }}
              data-testid="verify-reset-otp"
            />
            {error ? (
              <p className="auth-error" data-testid="verify-reset-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="verify-reset-submit">
              {loading ? "Verifying…" : "Continue"}
            </button>
          </form>
          <p className="auth-v2-footnote">
            <Link to="/forgot-password" className="auth-v2-inline-link" data-testid="verify-reset-new-code">
              Request a new code
            </Link>
            {" · "}
            <Link to="/login" className="auth-v2-inline-link">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
