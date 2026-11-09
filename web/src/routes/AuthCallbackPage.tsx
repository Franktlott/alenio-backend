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
    if (q.get("state") === "state_not_found") {
      return "Microsoft sign-in expired or was interrupted. Please try again.";
    }
    return null;
  } catch {
    return null;
  }
}

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
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        /* ignore */
      }

      try {
        const ready = await ensureWebSessionAndToken();
        if (cancelled) return;
        if (!ready) {
          setError("Could not verify your Microsoft session. Try again.");
          return;
        }
        await syncBackendUser();
        if (cancelled) return;
        const dest = await finishPostAuthNavigation();
        if (!cancelled) window.location.href = dest;
      } catch (err) {
        if (!cancelled) setError(formatAuthFlowError(err));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f8fafc",
        }}
        data-testid="auth-callback-screen"
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Sign-in issue</h1>
          <p style={{ color: "#64748b", margin: "0 0 16px" }}>{error}</p>
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#64748b",
        fontWeight: 600,
        background: "#f8fafc",
      }}
      data-testid="auth-callback-screen"
    >
      Signing you in…
    </div>
  );
}
