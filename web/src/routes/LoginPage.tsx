import { type FormEvent, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  clearAccessToken,
  getAccessToken,
  getAuthClient,
  setAccessTokenFromAuthData,
  syncBackendUser,
} from "../lib/auth-client";
import { formatAuthFlowError, isEmailNotVerifiedError } from "../lib/auth-errors";
import { looksLikeJwt } from "../lib/token";

export function LoginPage() {
  const [params] = useSearchParams();
  const reason = params.get("reason");
  const existing = getAccessToken();
  if (existing && looksLikeJwt(existing)) {
    return <Navigate to="/dashboard" replace />;
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "session" ? "Your session expired. Sign in again." : null,
  );

  const ensureSessionAndToken = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const sessionRes = await getAuthClient().getSession({
        fetchOptions: { headers: { "X-Force-Fetch": "1" } },
      } as never);
      const ok =
        setAccessTokenFromAuthData(sessionRes ?? null) ??
        setAccessTokenFromAuthData(sessionRes.data ?? null);
      if (sessionRes.data?.user && ok) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
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
      const result = await getAuthClient().signIn.email({
        email: emailNorm,
        password,
      });
      if (result.error && isEmailNotVerifiedError(result.error)) {
        const sent = await getAuthClient().emailOtp.sendVerificationOtp({
          email: emailNorm,
          type: "email-verification",
        });
        if (sent.error) {
          setError(sent.error.message ?? "Could not send verification email.");
          return;
        }
        clearAccessToken();
        window.location.href = `/verify?email=${encodeURIComponent(emailNorm)}`;
        return;
      }
      if (result.error) {
        setError(result.error.message ?? "Invalid email or password.");
        return;
      }
      setAccessTokenFromAuthData(result ?? null);
      setAccessTokenFromAuthData(result.data ?? null);
      const ready = await ensureSessionAndToken();
      if (!ready) {
        setError("Sign-in did not return a session. Try again.");
        return;
      }
      await syncBackendUser();
      window.location.href = "/dashboard";
    } catch (err) {
      setError(formatAuthFlowError(err));
    } finally {
      setLoading(false);
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
          <button type="submit" className="auth-btn-primary" disabled={loading} data-testid="login-submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          </form>
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
