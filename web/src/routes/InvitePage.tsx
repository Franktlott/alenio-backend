import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MobileAppCta } from "../components/MobileAppCta";
import { fetchTeamInviteByToken } from "../lib/api";
import { getInviteAppUrl } from "../lib/app-links";
import { ensureWebSessionAndToken, getAccessToken } from "../lib/auth-client";
import { finishPostAuthNavigation, setPendingInviteToken } from "../lib/invite-auth";
import { isMobileBrowser } from "../lib/mobile-browser";
import { isJwtExpiredSkew, looksLikeJwt } from "../lib/token";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const onMobile = useMemo(() => isMobileBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof fetchTeamInviteByToken>> | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This invite link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTeamInviteByToken(token);
        if (cancelled) return;
        setPreview(data);

        const existing = getAccessToken();
        if (existing && looksLikeJwt(existing) && !isJwtExpiredSkew(existing)) {
          const ready = await ensureWebSessionAndToken();
          if (ready) {
            setPendingInviteToken(token);
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
  }, [token, navigate]);

  const startSignUp = () => {
    if (!token || !preview) return;
    setPendingInviteToken(token);
    const q = new URLSearchParams({
      email: preview.email,
      invite: token,
    });
    navigate(`/sign-up?${q.toString()}`);
  };

  const startSignIn = () => {
    if (!token) return;
    setPendingInviteToken(token);
    const q = new URLSearchParams({ invite: token });
    if (preview?.email) q.set("email", preview.email);
    navigate(`/login?${q.toString()}`);
  };

  if (loading) {
    return (
      <div className="auth-v2-shell" data-testid="invite-screen-loading">
        <main className="auth-v2-main">
          <div className="auth-v2-card">
            <p className="auth-sub">Loading invite…</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="auth-v2-shell" data-testid="invite-screen-error">
        <main className="auth-v2-main">
          <div className="auth-v2-card">
            <h2 className="auth-heading">Invite unavailable</h2>
            <p className="auth-sub">{error ?? "This invite is no longer valid."}</p>
            <Link to="/login" className="auth-btn-primary" style={{ display: "inline-block", textAlign: "center", marginTop: 16 }}>
              Sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const teamCard = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 16,
        marginBottom: 20,
        borderRadius: 12,
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
      }}
    >
      {preview.teamImage ? (
        <img src={preview.teamImage} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
      ) : (
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent-soft, #EEF2FF)",
            color: "var(--accent)",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {(preview.teamName[0] ?? "?").toUpperCase()}
        </span>
      )}
      <div>
        <strong>{preview.teamName}</strong>
        <p className="auth-sub" style={{ margin: "4px 0 0" }}>
          Workspace invite for {preview.email}
        </p>
      </div>
    </div>
  );

  return (
    <div className="auth-v2-shell" data-testid="invite-screen">
      {!onMobile ? (
        <section className="auth-v2-hero">
          <div className="auth-v2-hero-inner">
            <Link to="/" className="auth-v2-back-site">
              ← Back to website
            </Link>
            <h1 className="auth-v2-hero-title">
              You&apos;re invited.
              <br />
              <span>Join {preview.teamName}</span>
            </h1>
            <p className="auth-v2-hero-copy">
              {preview.inviterName ? `${preview.inviterName} invited you` : "A team leader invited you"} to collaborate on Alenio.
              Create an account with <strong>{preview.email}</strong> to join automatically.
            </p>
          </div>
        </section>
      ) : null}
      <main className="auth-v2-main">
        <div className="auth-v2-card">
          {onMobile ? (
            <>
              <div className="auth-v2-card-head">
                <p className="auth-v2-eyebrow">Team invite</p>
                <h2 className="auth-heading">Join {preview.teamName}</h2>
                <p className="auth-sub">
                  {preview.inviterName ? `${preview.inviterName} invited you` : "You were invited"} to Alenio. The mobile app is the best experience on your phone.
                </p>
              </div>
              {teamCard}
              <MobileAppCta
                appUrl={getInviteAppUrl(token)}
                primaryLabel="Open invite in app"
                onContinueInBrowser={startSignUp}
                continueInBrowserLabel="Create account in browser"
              />
              <button type="button" className="mobile-app-cta-browser" onClick={startSignIn} data-testid="invite-sign-in">
                I already have an account
              </button>
            </>
          ) : (
            <>
              {teamCard}
              <button type="button" className="auth-btn-primary" onClick={startSignUp} data-testid="invite-create-account">
                Create account
              </button>
              <button type="button" className="auth-btn-secondary" onClick={startSignIn} style={{ marginTop: 12 }} data-testid="invite-sign-in">
                I already have an account
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
