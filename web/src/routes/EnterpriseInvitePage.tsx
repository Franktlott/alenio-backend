import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { ensureWebSessionAndToken, getAccessToken } from "../lib/auth-client";
import {
  finishPostAuthNavigation,
  setPendingEnterpriseInviteToken,
} from "../lib/invite-auth";
import { fetchEnterpriseInviteByToken } from "../lib/api";
import { isSessionTokenUsable } from "../lib/token";

export function EnterpriseInvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof fetchEnterpriseInviteByToken>> | null>(null);
  const tokenReady = useMemo(() => token.trim(), [token]);

  useEffect(() => {
    if (!tokenReady) {
      setError("This invite link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchEnterpriseInviteByToken(tokenReady);
        if (cancelled) return;
        setPreview(data);

        const existing = getAccessToken();
        if (isSessionTokenUsable(existing)) {
          const ready = await ensureWebSessionAndToken();
          if (ready) {
            setPendingEnterpriseInviteToken(tokenReady);
            const dest = await finishPostAuthNavigation();
            navigate(dest, { replace: true });
            return;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Invite not found or expired.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenReady, navigate]);

  const startSignUp = () => {
    if (!tokenReady || !preview) return;
    setPendingEnterpriseInviteToken(tokenReady);
    const q = new URLSearchParams({
      email: preview.email,
      enterpriseInvite: tokenReady,
    });
    if (preview.suggestedName) q.set("name", preview.suggestedName);
    navigate(`/sign-up?${q.toString()}`);
  };

  const startSignIn = () => {
    if (!tokenReady) return;
    setPendingEnterpriseInviteToken(tokenReady);
    const q = new URLSearchParams({ enterpriseInvite: tokenReady });
    if (preview?.email) q.set("email", preview.email);
    navigate(`/login?${q.toString()}`);
  };

  if (loading) {
    return (
      <EnterprisePageLoading label="Loading your enterprise invite" fullScreen testId="enterprise-invite-loading" />
    );
  }

  if (error || !preview) {
    return (
      <div className="auth-v2-shell" data-testid="enterprise-invite-error">
        <div className="auth-v2-card">
          <h1 className="auth-heading">Invite unavailable</h1>
          <p className="enterprise-muted">{error ?? "This invite is invalid or expired."}</p>
          <Link to="/login" className="auth-v2-inline-link">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-v2-shell" data-testid="enterprise-invite-screen">
      <div className="auth-v2-card">
        <p className="auth-eyebrow">Alenio Enterprise</p>
        <h1 className="auth-heading">Create your account</h1>
        <p className="enterprise-muted" style={{ marginBottom: "1rem" }}>
          <strong>{preview.customerName}</strong> is ready. Set your display name and password to continue
          {preview.workspaceName ? (
            <>
              {" "}
              — your first workspace will be <strong>{preview.workspaceName}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="enterprise-muted" style={{ marginBottom: "1.25rem", fontSize: 14 }}>
          Invite email: {preview.email}
        </p>
        <button type="button" className="auth-btn-primary" onClick={startSignUp} data-testid="enterprise-invite-signup">
          Create username &amp; password
        </button>
        <p style={{ marginTop: "1rem" }}>
          <button type="button" className="auth-v2-inline-link" onClick={startSignIn}>
            I already have an Alenio account
          </button>
        </p>
      </div>
    </div>
  );
}
