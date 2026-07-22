import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  clearAccessToken,
  ensureWebSessionAndToken,
  getAccessToken,
  getAuthClient,
  setAccessTokenFromAuthData,
} from "../lib/auth-client";
import { formatAuthFlowError, isEmailNotVerifiedError } from "../lib/auth-errors";
import { authErrorMessage, messageLooksLikeResumeSignUp } from "../lib/signup-recovery";
import { finishPostAuthNavigation, setPendingEnterpriseInviteToken, setPendingInviteToken } from "../lib/invite-auth";
import { isMobileBrowser } from "../lib/mobile-browser";
import { isSessionTokenExpired, isSessionTokenUsable } from "../lib/token";
import { goToEmailVerification, needsEmailVerification } from "../lib/verify-redirect";
import { signInWithMicrosoft } from "../lib/microsoft-auth";
import { discoverSsoForEmail } from "../lib/api";
import { getResolvedBackendUrl } from "../lib/env-config";

export function LoginPage() {
  const [params] = useSearchParams();
  const reason = params.get("reason");
  const sessionExpired = reason === "session";
  const verified = params.get("verified") === "1";
  const inviteToken = (params.get("invite") ?? "").trim();
  const enterpriseInviteToken = (params.get("enterpriseInvite") ?? "").trim();
  const emailFromInvite = (params.get("email") ?? "").trim().toLowerCase();
  const ssoStatus = params.get("sso");
  const ssoMessage = params.get("message");
  const [email, setEmail] = useState(emailFromInvite);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    ssoStatus === "error" ? ssoMessage || "Company SSO sign-in failed. Try again." : null,
  );
  const [hint, setHint] = useState<string | null>(
    verified ? "Email verified. Sign in with your password to continue." : null,
  );

  useEffect(() => {
    if (inviteToken) setPendingInviteToken(inviteToken);
  }, [inviteToken]);

  useEffect(() => {
    if (enterpriseInviteToken) setPendingEnterpriseInviteToken(enterpriseInviteToken);
  }, [enterpriseInviteToken]);

  useEffect(() => {
    const t = getAccessToken();
    if (t && isSessionTokenExpired(t)) {
      clearAccessToken();
    }
  }, []);

  const existing = getAccessToken();
  if (isSessionTokenUsable(existing)) {
    return <Navigate to={isMobileBrowser() ? "/get-app" : "/chat"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setHint(null);
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      setError("Enter your work email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    try {
      let result: Awaited<ReturnType<ReturnType<typeof getAuthClient>["signIn"]["email"]>>;
      try {
        result = await getAuthClient().signIn.email({
          email: emailNorm,
          password,
        });
      } catch (signInErr) {
        const msg = authErrorMessage(signInErr) || formatAuthFlowError(signInErr);
        if (isEmailNotVerifiedError(signInErr) || messageLooksLikeResumeSignUp(msg)) {
          await goToEmailVerification({ email: emailNorm, inviteToken, password });
          return;
        }
        throw signInErr;
      }
      const signedInUser = (result.data as { user?: { emailVerified?: boolean } } | undefined)?.user;
      if (needsEmailVerification(result.error, signedInUser)) {
        await goToEmailVerification({ email: emailNorm, inviteToken, password });
        return;
      }
      if (result.error) {
        const msg =
          (typeof result.error.message === "string" ? result.error.message : authErrorMessage(result.error)) ??
          "Invalid email or password.";
        if (messageLooksLikeResumeSignUp(msg)) {
          await goToEmailVerification({ email: emailNorm, inviteToken, password });
          return;
        }
        setError(msg);
        return;
      }
      setAccessTokenFromAuthData(result ?? null);
      setAccessTokenFromAuthData(result.data ?? null);
      const ready = await ensureWebSessionAndToken();
      if (!ready) {
        setError("Sign-in did not return a session. Try again.");
        return;
      }
      const dest = await finishPostAuthNavigation();
      window.location.href = dest;
    } catch (err) {
      const msg = authErrorMessage(err) || formatAuthFlowError(err);
      if (isEmailNotVerifiedError(err) || messageLooksLikeResumeSignUp(msg)) {
        await goToEmailVerification({ email: emailNorm, inviteToken, password });
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onMicrosoft = async () => {
    if (loading || microsoftLoading || ssoLoading) return;
    setError(null);
    setMicrosoftLoading(true);
    try {
      if (inviteToken) setPendingInviteToken(inviteToken);
      const result = await signInWithMicrosoft();
      if (result.error) {
        setError(result.error.message ?? "Microsoft sign-in failed.");
        setMicrosoftLoading(false);
      }
      // On success the browser redirects to Microsoft — leave loading state on.
    } catch (err) {
      setError(formatAuthFlowError(err));
      setMicrosoftLoading(false);
    }
  };

  const onCompanySso = async () => {
    if (loading || microsoftLoading || ssoLoading) return;
    setError(null);
    setHint(null);
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm) {
      setError("Enter your work email to continue with company SSO.");
      return;
    }
    setSsoLoading(true);
    try {
      const discovery = await discoverSsoForEmail(emailNorm);
      if (!discovery.ssoAvailable || !discovery.startPath) {
        if (discovery.reason === "domain_unverified") {
          setError("Company SSO is not ready yet (domain not verified). Contact your workspace owner.");
        } else {
          setError("No company SSO is set up for that email domain yet.");
        }
        setSsoLoading(false);
        return;
      }
      if (inviteToken) setPendingInviteToken(inviteToken);
      const base = getResolvedBackendUrl().replace(/\/$/, "");
      window.location.href = `${base}${discovery.startPath}`;
    } catch (err) {
      setError(formatAuthFlowError(err));
      setSsoLoading(false);
    }
  };

  return (
    <div className="auth-v2-shell" data-testid="login-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            Welcome back.
            <br />
            <span>Run your team with confidence.</span>
          </h1>
          <p className="auth-v2-hero-copy">
            Sign in with the same account you use in the Alenio mobile app to access the enterprise dashboard.
          </p>
          <ul className="auth-v2-points">
            <li>Real-time team coordination</li>
            <li>Task and execution visibility</li>
            <li>Multi-workspace enterprise control</li>
          </ul>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Team admin</p>
            <h2 className="auth-heading">Sign in</h2>
            <p className="auth-sub">Use your work credentials to continue.</p>
          </div>
          <form onSubmit={onSubmit}>
          {sessionExpired ? (
            <div className="auth-session-notice" role="status" data-testid="login-session-notice">
              <span className="auth-session-notice-icon" aria-hidden="true">
                ⏱
              </span>
              <div>
                <p className="auth-session-notice-title">Your session has ended</p>
                <p className="auth-session-notice-copy">
                  For your security, you were signed out after a period of inactivity. Sign in to continue.
                </p>
              </div>
            </div>
          ) : null}
          <label className="auth-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="auth-input"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
          />
          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="auth-input"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password"
          />
          {error ? (
            <p className="auth-error" data-testid="login-error">
              {error}
            </p>
          ) : null}
          {hint ? (
            <p className="auth-hint" data-testid="login-verified-hint">
              {hint}
            </p>
          ) : null}
          <button
            type="submit"
            className="auth-btn-primary"
            disabled={loading || microsoftLoading || ssoLoading}
            data-testid="login-submit"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          </form>
          <div className="auth-v2-divider" aria-hidden="true">
            <span>or</span>
          </div>
          <button
            type="button"
            className="auth-btn-secondary"
            disabled={loading || microsoftLoading || ssoLoading}
            onClick={() => void onCompanySso()}
            data-testid="login-company-sso"
            style={{ marginBottom: "0.65rem" }}
          >
            {ssoLoading ? "Checking SSO…" : "Continue with company SSO"}
          </button>
          <button
            type="button"
            className="auth-btn-secondary auth-btn-microsoft"
            disabled={loading || microsoftLoading || ssoLoading}
            onClick={() => void onMicrosoft()}
            data-testid="login-microsoft"
          >
            {microsoftLoading ? "Redirecting…" : "Continue with Microsoft"}
          </button>
          <p className="auth-v2-footnote" style={{ marginTop: "0.75rem" }}>
            <Link to="/sign-up" className="auth-v2-inline-link" data-testid="login-sign-up-link">
              Create account
            </Link>
            {" · "}
            <Link to="/forgot-password" className="auth-v2-inline-link" data-testid="login-forgot-password">
              Forgot password?
            </Link>
          </p>
          <p className="auth-v2-footnote">
            <Link to="/privacy" className="auth-v2-inline-link">
              Privacy Policy
            </Link>
            {" · "}
            <Link to="/terms" className="auth-v2-inline-link">
              Terms of Service
            </Link>
          </p>
          <p className="auth-v2-footnote">
            Need product overview?{" "}
            <Link to="/" className="auth-v2-inline-link">
              Go to website
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
