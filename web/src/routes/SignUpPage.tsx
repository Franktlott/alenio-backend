import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  clearAccessToken,
  ensureWebSessionAndToken,
  getAccessToken,
  getAuthClient,
  setAccessTokenFromAuthData,
  syncBackendUser,
} from "../lib/auth-client";
import { formatAuthFlowError, isEmailNotVerifiedError } from "../lib/auth-errors";
import { isJwtExpiredSkew, looksLikeJwt } from "../lib/token";
import { createWebTeam } from "../lib/api";
import { LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "../lib/legal-constants";

const WORKSPACE_STORAGE_KEY = "alenio_web_signup_workspace";

export function SignUpPage() {
  const existing = getAccessToken();
  useEffect(() => {
    const t = getAccessToken();
    if (t && looksLikeJwt(t) && isJwtExpiredSkew(t)) {
      clearAccessToken();
    }
  }, []);

  if (existing && looksLikeJwt(existing) && !isJwtExpiredSkew(existing)) {
    return <Navigate to="/chat" replace />;
  }

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const nameTrim = name.trim();
    const emailNorm = email.trim().toLowerCase();
    const ws = workspace.trim();
    if (!nameTrim) {
      setError("Enter your name.");
      return;
    }
    if (!emailNorm) {
      setError("Enter your work email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!ws) {
      setError("Enter a workspace name (your team will use this in Alenio).");
      return;
    }
    setLoading(true);
    try {
      const result = await getAuthClient().signUp.email({
        name: nameTrim,
        email: emailNorm,
        password,
      });
      if (result.error) {
        if (isEmailNotVerifiedError(result.error)) {
          const sent = await getAuthClient().emailOtp.sendVerificationOtp({
            email: emailNorm,
            type: "email-verification",
          });
          if (sent.error) {
            setError(sent.error.message ?? "Could not send verification email.");
            return;
          }
          sessionStorage.setItem(WORKSPACE_STORAGE_KEY, ws);
          clearAccessToken();
          window.location.href = `/verify?email=${encodeURIComponent(emailNorm)}&workspace=${encodeURIComponent(ws)}`;
          return;
        }
        setError(result.error.message ?? "Could not create account.");
        return;
      }

      setAccessTokenFromAuthData(result ?? null);
      setAccessTokenFromAuthData(result.data ?? null);

      const createdUser = (result.data as { user?: { emailVerified?: boolean } } | undefined)?.user;
      if (createdUser && createdUser.emailVerified === false) {
        const sent = await getAuthClient().emailOtp.sendVerificationOtp({
          email: emailNorm,
          type: "email-verification",
        });
        if (sent.error) {
          setError(sent.error.message ?? "Could not send verification email.");
          return;
        }
        sessionStorage.setItem(WORKSPACE_STORAGE_KEY, ws);
        clearAccessToken();
        window.location.href = `/verify?email=${encodeURIComponent(emailNorm)}&workspace=${encodeURIComponent(ws)}`;
        return;
      }

      const ready = await ensureWebSessionAndToken();
      if (!ready) {
        setError("Account created but session did not start. Try signing in.");
        return;
      }
      await syncBackendUser();
      try {
        await createWebTeam(ws);
      } catch (ce) {
        setError(ce instanceof Error ? ce.message : "Could not create workspace. Try from Team after sign-in.");
        return;
      }
      sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
      window.location.href = "/chat";
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-v2-shell" data-testid="sign-up-screen">
      <section className="auth-v2-hero">
        <div className="auth-v2-hero-inner">
          <Link to="/" className="auth-v2-back-site">
            ← Back to website
          </Link>
          <h1 className="auth-v2-hero-title">
            Create your workspace.
            <br />
            <span>Same plan on web and mobile.</span>
          </h1>
          <p className="auth-v2-hero-copy">
            Start in Chat right away. Upgrade to the Team plan anytime from Plan in the sidebar — subscriptions started
            in the mobile app use the App Store instead.
          </p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Web sign-up</p>
            <h2 className="auth-heading">Account &amp; workspace</h2>
            <p className="auth-sub">Use a strong password. You&apos;ll confirm your email next if required.</p>
          </div>
          <form onSubmit={onSubmit}>
            <label className="auth-label" htmlFor="su-name">
              Full name
            </label>
            <input
              id="su-name"
              name="name"
              type="text"
              className="auth-input"
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="sign-up-name"
            />
            <label className="auth-label" htmlFor="su-email">
              Email address
            </label>
            <input
              id="su-email"
              name="email"
              type="email"
              className="auth-input"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="sign-up-email"
            />
            <label className="auth-label" htmlFor="su-workspace">
              Workspace name
            </label>
            <input
              id="su-workspace"
              name="workspace"
              type="text"
              className="auth-input"
              autoComplete="organization"
              placeholder="e.g. Acme Retail"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              data-testid="sign-up-workspace"
            />
            <label className="auth-label" htmlFor="su-password">
              Password
            </label>
            <input
              id="su-password"
              name="password"
              type="password"
              className="auth-input"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="sign-up-password"
            />
            {error ? (
              <p className="auth-error" data-testid="sign-up-error">
                {error}
              </p>
            ) : null}
            <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="sign-up-submit">
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="auth-v2-footnote" style={{ marginTop: "0.75rem" }}>
            By continuing, you agree to {LEGAL_COMPANY_NAME}&apos;s (parent company: {LEGAL_PARENT_COMPANY_NAME}){" "}
            <Link to="/terms" className="auth-v2-inline-link">
              Terms of Service
            </Link>
            {" and "}
            <Link to="/privacy" className="auth-v2-inline-link">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="auth-v2-footnote" style={{ marginTop: "0.75rem" }}>
            Already have an account?{" "}
            <Link to="/login" className="auth-v2-inline-link" data-testid="sign-up-login-link">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
