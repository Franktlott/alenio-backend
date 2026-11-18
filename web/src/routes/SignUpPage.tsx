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
import { finishPostAuthNavigation, setPendingEnterpriseInviteToken, setPendingInviteToken } from "../lib/invite-auth";
import { isMobileBrowser } from "../lib/mobile-browser";
import { WEB_APP_HOME } from "../lib/web-app-home";
import { goToEmailVerification } from "../lib/verify-redirect";
import { setPendingSignUp } from "../lib/pending-signup";
import { LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "../lib/legal-constants";
import { signInWithMicrosoft } from "../lib/microsoft-auth";
import { TurnstileCaptcha } from "../components/TurnstileCaptcha";

export function SignUpPage() {
  const [params] = useSearchParams();
  const inviteToken = useMemo(() => (params.get("invite") ?? "").trim(), [params]);
  const enterpriseInviteToken = useMemo(() => (params.get("enterpriseInvite") ?? "").trim(), [params]);
  const emailFromInvite = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const nameFromInvite = useMemo(() => (params.get("name") ?? "").trim(), [params]);
  const [name, setName] = useState(nameFromInvite);
  const [email, setEmail] = useState(emailFromInvite);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [honeypot, setHoneypot] = useState("");

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
    if (enterpriseInviteToken) setPendingEnterpriseInviteToken(enterpriseInviteToken);
  }, [enterpriseInviteToken]);


  useEffect(() => {
    if (emailFromInvite) setEmail(emailFromInvite);
  }, [emailFromInvite]);

  useEffect(() => {
    if (nameFromInvite) setName(nameFromInvite);
  }, [nameFromInvite]);

  const existing = getAccessToken();
  if (isSessionTokenUsable(existing)) {
    return <Navigate to={isMobileBrowser() ? "/get-app" : WEB_APP_HOME} replace />;
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

    if (honeypot.trim()) {
      setError("Unable to create account.");
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);
    try {
      let result: Awaited<ReturnType<ReturnType<typeof getAuthClient>["signUp"]["email"]>>;
      try {
        result = await getAuthClient().signUp.email({
          name: nameTrim,
          email: emailNorm,
          password,
          fetchOptions: captchaToken
            ? {
                headers: {
                  "x-captcha-response": captchaToken,
                },
              }
            : undefined,
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
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  const onMicrosoft = async () => {
    if (loading || microsoftLoading) return;
    setError(null);
    setMicrosoftLoading(true);
    try {
      if (inviteToken) setPendingInviteToken(inviteToken);
      const result = await signInWithMicrosoft();
      if (result.error) {
        setError(result.error.message ?? "Microsoft sign-in failed.");
        setMicrosoftLoading(false);
      }
    } catch (err) {
      setError(formatAuthFlowError(err));
      setMicrosoftLoading(false);
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
            Your Network.
            <br />
            Your Workspace.
            <br />
            <span>One Platform.</span>
          </h1>
          <p className="auth-v2-hero-copy">
            {inviteToken
              ? "After you verify your email, you'll join the workspace from your invite automatically."
              : "Join the Alenio network for free on web and in the app. Add a workspace for your team whenever you are ready."}
          </p>
          {inviteToken ? null : (
            <ul className="auth-v2-points">
              <li>Free to join the network</li>
              <li>Connect, share wins, and grow with frontline leaders</li>
              <li>Add a workspace anytime — 14-day free trial</li>
            </ul>
          )}
        </div>
      </section>
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Get started</p>
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
            <div className="auth-hp" aria-hidden="true">
              <label htmlFor="su-website">Company website</label>
              <input
                id="su-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>
            <TurnstileCaptcha
              resetKey={captchaReset}
              onToken={setCaptchaToken}
              onRequiredChange={setCaptchaRequired}
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
            <button
              type="submit"
              className="auth-btn-primary"
              disabled={loading || microsoftLoading}
              data-testid="sign-up-submit"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
          <div className="auth-v2-divider" aria-hidden="true">
            <span>or</span>
          </div>
          <div className="auth-provider-stack">
            <button
              type="button"
              className="auth-provider-btn"
              disabled={loading || microsoftLoading}
              onClick={() => void onMicrosoft()}
              data-testid="sign-up-microsoft"
            >
              {microsoftLoading ? (
                "Redirecting…"
              ) : (
                <>
                  <svg className="auth-provider-icon auth-provider-icon--ms" width="18" height="18" viewBox="0 0 21 21" aria-hidden>
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  <span>Continue with Microsoft</span>
                </>
              )}
            </button>
          </div>
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
