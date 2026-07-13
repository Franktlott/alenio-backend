import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  clearAccessToken,
  ensureWebSessionAndToken,
  getAccessToken,
  getAuthClient,
  setAccessTokenFromAuthData,
  syncBackendUser,
} from "../lib/auth-client";
import { formatAuthFlowError, isEmailNotVerifiedError } from "../lib/auth-errors";
import {
  authErrorMessage,
  handleExistingEmailOnSignUp,
  isExistingEmailSignUpError,
  messageLooksLikeResumeSignUp,
} from "../lib/signup-recovery";
import { isSessionTokenExpired, isSessionTokenUsable } from "../lib/token";
import { finishPostAuthNavigation, setPendingInviteToken } from "../lib/invite-auth";
import { isMobileBrowser } from "../lib/mobile-browser";
import { goToEmailVerification } from "../lib/verify-redirect";
import { setPendingSignUp } from "../lib/pending-signup";
import { LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "../lib/legal-constants";

export function SignUpPage() {
  const [params] = useSearchParams();
  const inviteToken = useMemo(() => (params.get("invite") ?? "").trim(), [params]);
  const emailFromInvite = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailFromInvite);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getAccessToken();
    if (t && isSessionTokenExpired(t)) {
      clearAccessToken();
    }
  }, []);

  useEffect(() => {
    if (inviteToken) setPendingInviteToken(inviteToken);
  }, [inviteToken]);

  useEffect(() => {
    if (emailFromInvite) setEmail(emailFromInvite);
  }, [emailFromInvite]);

  const existing = getAccessToken();
  if (isSessionTokenUsable(existing)) {
    return <Navigate to={isMobileBrowser() ? "/get-app" : "/chat"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const nameTrim = name.trim();
    const emailNorm = email.trim().toLowerCase();
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

    const finishExistingEmailRecovery = async (knownUnverified: boolean) => {
      try {
        const outcome = await handleExistingEmailOnSignUp({
          email: emailNorm,
          password,
          inviteToken,
          knownUnverified,
        });
        if (outcome.kind === "signed-in") {
          const ready = await ensureWebSessionAndToken();
          if (!ready) {
            setError("Account exists but sign-in did not start. Try signing in.");
            return;
          }
          const dest = await finishPostAuthNavigation();
          window.location.href = dest;
          return;
        }
        if (outcome.kind === "wrong-password") {
          setError(
            "An account with this email already exists. Sign in with your password, or reset it if you forgot.",
          );
          return;
        }
      } catch (recoveryErr) {
        const msg = authErrorMessage(recoveryErr) || formatAuthFlowError(recoveryErr);
        if (isExistingEmailSignUpError(recoveryErr) || messageLooksLikeResumeSignUp(msg)) {
          setPendingSignUp(emailNorm, password);
          await goToEmailVerification({ email: emailNorm, inviteToken, password });
          return;
        }
        throw recoveryErr;
      }
    };

    setLoading(true);
    try {
      let result: Awaited<ReturnType<ReturnType<typeof getAuthClient>["signUp"]["email"]>>;
      try {
        result = await getAuthClient().signUp.email({
          name: nameTrim,
          email: emailNorm,
          password,
        });
      } catch (signUpErr) {
        const signUpMsg = authErrorMessage(signUpErr) || formatAuthFlowError(signUpErr);
        if (isExistingEmailSignUpError(signUpErr) || messageLooksLikeResumeSignUp(signUpMsg)) {
          await finishExistingEmailRecovery(
            isEmailNotVerifiedError(signUpErr) || messageLooksLikeResumeSignUp(signUpMsg),
          );
          return;
        }
        throw signUpErr;
      }

      if (result.error) {
        const resultMsg =
          (typeof result.error.message === "string" ? result.error.message : authErrorMessage(result.error)) ?? "";
        if (isExistingEmailSignUpError(result.error) || messageLooksLikeResumeSignUp(resultMsg)) {
          await finishExistingEmailRecovery(
            isEmailNotVerifiedError(result.error) || messageLooksLikeResumeSignUp(resultMsg),
          );
          return;
        }
        setError(resultMsg || "Could not create account.");
        return;
      }

      setAccessTokenFromAuthData(result ?? null);
      setAccessTokenFromAuthData(result.data ?? null);

      const createdUser = (result.data as { user?: { emailVerified?: boolean } } | undefined)?.user;
      if (createdUser && createdUser.emailVerified === false) {
        setPendingSignUp(emailNorm, password);
        await goToEmailVerification({ email: emailNorm, inviteToken, attemptSendCode: false, password });
        return;
      }

      await syncBackendUser();

      const ready = await ensureWebSessionAndToken();
      if (!ready) {
        setError("Account created but session did not start. Try signing in.");
        return;
      }
      const dest = await finishPostAuthNavigation();
      window.location.href = dest;
    } catch (err) {
      const msg = authErrorMessage(err) || formatAuthFlowError(err);
      if (isExistingEmailSignUpError(err) || messageLooksLikeResumeSignUp(msg)) {
        setPendingSignUp(emailNorm, password);
        await goToEmailVerification({ email: emailNorm, inviteToken, password });
        return;
      }
      setError(msg);
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
            Create your account.
            <br />
            <span>Same plan on web and mobile.</span>
          </h1>
          <p className="auth-v2-hero-copy">
            {inviteToken
              ? "After you verify your email, you'll join the workspace from your invite automatically."
              : "Start in Chat right away. You can create or join a workspace anytime from Team."}
          </p>
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Web sign-up</p>
            <h2 className="auth-heading">Your account</h2>
            <p className="auth-sub">Use a strong password. You&apos;ll confirm your email next if required.</p>
            <p className="auth-sub" style={{ marginTop: "0.5rem" }}>
              Already started sign-up? Use the same email and password here — we&apos;ll send you to verification.
            </p>
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
              readOnly={!!emailFromInvite}
              data-testid="sign-up-email"
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
                {messageLooksLikeResumeSignUp(error) ? (
                  <>
                    {" "}
                    <Link
                      to={`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                      className="auth-v2-inline-link"
                    >
                      Enter verification code
                    </Link>
                  </>
                ) : null}
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
