import { useEffect, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { MobileAppCta } from "../components/MobileAppCta";
import {
  clearMobileHandoffEmail,
  getMobileHandoffEmail,
  getSignInAppUrl,
  setMobileWebPreferred,
} from "../lib/app-links";
import { getAccessToken } from "../lib/auth-client";
import { isMobileBrowser } from "../lib/mobile-browser";
import { isSessionTokenUsable } from "../lib/token";

export function GetAppPage() {
  const [params] = useSearchParams();
  const emailFromQuery = useMemo(() => (params.get("email") ?? "").trim().toLowerCase(), [params]);
  const email = emailFromQuery || getMobileHandoffEmail();
  const token = getAccessToken();

  useEffect(() => {
    return () => {
      if (emailFromQuery) clearMobileHandoffEmail();
    };
  }, [emailFromQuery]);

  if (!isSessionTokenUsable(token)) {
    return <Navigate to="/login" replace />;
  }

  if (!isMobileBrowser()) {
    return <Navigate to="/chat" replace />;
  }

  const appUrl = getSignInAppUrl(email);

  return (
    <div className="auth-v2-shell mobile-get-app-shell" data-testid="get-app-screen">
      <main className="auth-v2-main">
        <div className="auth-v2-card mobile-get-app-card">
          <div className="auth-v2-card-head">
            <p className="auth-v2-eyebrow">You&apos;re all set</p>
            <h2 className="auth-heading">Open Alenio on your phone</h2>
            <p className="auth-sub">
              Your account{email ? (
                <>
                  {" "}
                  (<strong>{email}</strong>)
                </>
              ) : null}{" "}
              is ready. Alenio works best in the mobile app — tap below to open or download it, then sign in with the same email.
            </p>
          </div>

          <MobileAppCta
            appUrl={appUrl}
            primaryLabel="Open Alenio app"
            onContinueInBrowser={() => {
              setMobileWebPreferred();
              window.location.href = "/chat";
            }}
            continueInBrowserLabel="Continue on web anyway"
          />

          <p className="auth-v2-footnote" style={{ marginTop: "1rem" }}>
            <Link
              to="/settings"
              className="auth-v2-inline-link"
              onClick={() => setMobileWebPreferred()}
            >
              Account settings on web
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
