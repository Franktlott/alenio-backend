import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ensureWebSessionAndToken,
  syncBackendUser,
} from "../lib/auth-client";
import { setStoredToken } from "../lib/token";
import { finishPostAuthNavigation } from "../lib/invite-auth";
import { formatAuthFlowError } from "../lib/auth-errors";

function readAuthTokenFromHash(): string | null {
  try {
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(raw);
    const fromHash = params.get("auth_token")?.trim();
    if (fromHash) return fromHash;
    const q = new URLSearchParams(window.location.search);
    return q.get("auth_token")?.trim() || q.get("token")?.trim() || null;
  } catch {
    return null;
  }
}

function readOAuthError(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const err = q.get("error")?.trim();
    if (err) {
      const desc = q.get("error_description")?.trim();
      return desc ? `${err}: ${desc}` : err;
    }
    // Better Auth sends this when the OAuth callback was missing `state`.
    if (q.get("state") === "state_not_found") {
      return "Microsoft sign-in expired or was interrupted. Please try again.";
    }
    return null;
  } catch {
    return null;
  }
}

/** Completes Microsoft (and other social) OAuth after Better Auth redirects back with a bearer token. */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const oauthError = readOAuthError();
      if (oauthError) {
        if (!cancelled) setError(oauthError);
        return;
      }

      const token = readAuthTokenFromHash();
      if (!token) {
        if (!cancelled) {
          setError("Sign-in did not return a session. Try again with Microsoft, or use email and password.");
        }
        return;
      }

      setStoredToken(token);
      // Drop token from the address bar.
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        /* ignore */
      }

      const ready = await ensureWebSessionAndToken();
      if (!ready) {
        if (!cancelled) setError("Could not verify your Microsoft session. Try again.");
        return;
      }

      await syncBackendUser();
      const dest = await finishPostAuthNavigation();
      if (!cancelled) {
        window.location.href = dest;
      }
    };

    void run().catch((err) => {
      if (!cancelled) setError(formatAuthFlowError(err));
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="auth-v2-shell" data-testid="auth-callback-screen">
      <main className="auth-v2-main" style={{ gridColumn: "1 / -1" }}>
        <div className="auth-v2-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">Microsoft</p>
            <h2 className="auth-heading">{error ? "Sign-in issue" : "Finishing sign-in…"}</h2>
            <p className="auth-sub">
              {error
                ? "We could not complete Microsoft sign-in."
                : "One moment while we connect your account."}
            </p>
          </div>
          {error ? (
            <>
              <p className="auth-error" data-testid="auth-callback-error">
                {error}
              </p>
              <Link to="/login" className="auth-btn-primary" style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <p className="auth-sub" data-testid="auth-callback-loading">
              Please wait…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
