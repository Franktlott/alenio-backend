import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ensureWebSessionAndToken,
  getAuthClient,
  setAccessTokenFromAuthData,
  syncBackendUser,
} from "../lib/auth-client";
import { formatAuthFlowError } from "../lib/auth-errors";
import { finishPostAuthNavigation, setPendingInviteToken } from "../lib/invite-auth";
import { tryFinishSignUpAfterVerify } from "../lib/signup-recovery";
import { consumeVerifyHint } from "../lib/verify-redirect";

const OTP_MIN = 6;
const OTP_MAX = 10;

export function VerifyPage() {
  const [params] = useSearchParams();
  const email = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const inviteToken = useMemo(() => (params.get("invite") ?? "").trim(), [params]);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (inviteToken) setPendingInviteToken(inviteToken);
  }, [inviteToken]);

  useEffect(() => {
    const stored = consumeVerifyHint();
    if (stored) setHint(stored);
  }, []);

  if (!email) {
    return <Navigate to="/login" replace />;
  }

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = otp.replace(/\D/g, "");
    if (code.length < OTP_MIN) {
      setError(`Enter the full code (at least ${OTP_MIN} digits).`);
      return;
    }
    if (code.length > OTP_MAX) {
      setError("That code looks too long.");
      return;
    }
    setLoading(true);
    try {
      const result = await getAuthClient().emailOtp.verifyEmail({
        email,
        otp: code,
      });
      if (result?.error) {
        setError(
          typeof result.error.message === "string"
            ? result.error.message
            : "That code did not work. Try again.",
        );
        return;
      }
      setAccessTokenFromAuthData(result ?? null);
      setAccessTokenFromAuthData(result.data ?? null);
      let sessionReady = await ensureWebSessionAndToken();
      if (!sessionReady) {
        sessionReady = await tryFinishSignUpAfterVerify(email);
      }
      if (!sessionReady) {
        setError("Verified, but session did not start. Try signing in, then open Chat from the sidebar.");
        return;
      }
      await syncBackendUser();
      const dest = await finishPostAuthNavigation();
      window.location.href = dest;
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setHint(null);
    setError(null);
    setResendLoading(true);
    try {
      const sent = await getAuthClient().emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (sent.error) {
        setError(sent.error.message ?? "Could not resend code.");
      } else {
        setHint("We sent a new code to your email.");
      }
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-v2-shell" data-testid="verify-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            Verify your email.
            <br />
            <span>Secure your account access.</span>
          </h1>
          <p className="auth-v2-hero-copy">Finish verification to continue into your enterprise dashboard.</p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Email verification</p>
            <h2 className="auth-heading">Enter verification code</h2>
            <p className="auth-sub">
              We sent a code to <strong>{email}</strong>
            </p>
          </div>
          <form onSubmit={onVerify}>
          <label className="auth-label" htmlFor="otp">
            Verification code
          </label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="auth-input"
            style={{ letterSpacing: "0.2em", fontSize: "1.125rem" }}
            data-testid="verify-otp"
          />
          {error ? (
            <p className="auth-error" data-testid="verify-error">
              {error}
            </p>
          ) : null}
          {hint ? (
            <p className="auth-hint" data-testid="verify-hint">
              {hint}
            </p>
          ) : null}
          <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="verify-submit">
            {loading ? "Verifying…" : "Continue"}
          </button>
          </form>
          <button
            type="button"
            className="auth-btn-secondary"
            onClick={onResend}
            disabled={resendLoading}
            data-testid="verify-resend"
          >
            {resendLoading ? "Sending…" : "Resend code"}
          </button>
          <p className="auth-v2-footnote">
            Need help?{" "}
            <Link to="/" className="auth-v2-inline-link">
              Return to website
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
