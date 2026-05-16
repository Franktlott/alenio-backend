import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  fetchWebCheckoutConfig,
  fetchWebTeamSubscription,
  postWebBillingCheckout,
  postWebBillingPortal,
  type WebMeUser,
  type WebTeamRow,
  type WebTeamSubscription,
} from "../lib/api";
import { FREE_INCLUDED, FREE_LOCKED, TEAM_FEATURES } from "../lib/plan-catalog";

function planLabel(plan: string): string {
  if (plan === "team" || plan === "pro") return "Team";
  return "Free";
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function subscriptionLine(sub: WebTeamSubscription, stripeActive: boolean): string | null {
  if (stripeActive) {
    return "Billed on the web — use Manage billing below to update payment or cancel.";
  }
  if (
    sub.currentPeriodEnd &&
    (sub.plan === "team" || sub.plan === "pro") &&
    ["active", "trialing", "past_due"].includes(sub.status)
  ) {
    return `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return null;
}

export function BillingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { me, teams, selectedTeamId, setSelectedTeamId, setWorkspaceMainLoading } = useEnterpriseShell();
  const [sub, setSub] = useState<WebTeamSubscription | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subErr, setSubErr] = useState<string | null>(null);
  const [subRetryKey, setSubRetryKey] = useState(0);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutCfg, setCheckoutCfg] = useState<{ configured: boolean; missingKeys: string[] } | null>(null);
  const autoCheckoutStarted = useRef(false);
  /** Team id for which `sub` was last loaded successfully (enables silent background refresh). */
  const loadedSubTeamIdRef = useRef<string | null>(null);

  const billingFlash = params.get("billing");
  /** True only on first load / workspace switch / retry after error — not on 35s poll or focus refresh. */
  const showPlanLoading = subLoading && !sub;

  useEffect(() => {
    setWorkspaceMainLoading(showPlanLoading);
    return () => setWorkspaceMainLoading(false);
  }, [showPlanLoading, setWorkspaceMainLoading]);

  useEffect(() => {
    if (!selectedTeamId) {
      loadedSubTeamIdRef.current = null;
      setSub(null);
      setSubErr(null);
      setSubLoading(false);
      return;
    }
    if (teams !== null) {
      const row = teams.find((t) => t.id === selectedTeamId);
      if (!row || row.role !== "owner") {
        loadedSubTeamIdRef.current = null;
        setSub(null);
        setSubErr(null);
        setSubLoading(false);
        return;
      }
    }
    if (teams && !teams.some((t) => t.id === selectedTeamId)) {
      loadedSubTeamIdRef.current = null;
      setSub(null);
      setSubErr("That workspace is not in your team list. Pick another workspace above.");
      setSubLoading(false);
      return;
    }
    const silentRefresh = loadedSubTeamIdRef.current === selectedTeamId;
    let cancelled = false;
    if (!silentRefresh) {
      setSubLoading(true);
      setSubErr(null);
      setSub(null);
    }
    (async () => {
      try {
        const s = await fetchWebTeamSubscription(selectedTeamId);
        if (cancelled) return;
        setSub(s);
        setSubErr(null);
        loadedSubTeamIdRef.current = selectedTeamId;
      } catch (e) {
        if (cancelled) return;
        if (silentRefresh) return;
        loadedSubTeamIdRef.current = null;
        setSub(null);
        setSubErr(e instanceof Error ? e.message : "Could not load subscription.");
      } finally {
        if (!cancelled && !silentRefresh) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, teams, subRetryKey]);

  /** After checkout redirect, webhooks can lag; refetch subscription until it reflects payment. */
  useEffect(() => {
    if (billingFlash !== "success" || !selectedTeamId) return;
    setSubRetryKey((k) => k + 1);
    let n = 0;
    const max = 44;
    const id = window.setInterval(() => {
      n += 1;
      setSubRetryKey((k) => k + 1);
      if (n >= max) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [billingFlash, selectedTeamId]);

  /** Return from billing portal / another tab: refetch so plan matches webhooks without a full reload. */
  useEffect(() => {
    if (!selectedTeamId) return;
    const bumpIfVisible = () => {
      if (document.visibilityState === "visible") setSubRetryKey((k) => k + 1);
    };
    window.addEventListener("focus", bumpIfVisible);
    document.addEventListener("visibilitychange", bumpIfVisible);
    return () => {
      window.removeEventListener("focus", bumpIfVisible);
      document.removeEventListener("visibilitychange", bumpIfVisible);
    };
  }, [selectedTeamId]);

  /**
   * While Plan shows a billable workspace, poll the API so payment-provider–driven DB changes
   * (downgrade, cancel, past_due) show up without asking the user to refresh.
   */
  useEffect(() => {
    if (!selectedTeamId || !sub) return;
    const billable =
      !!sub.stripeSubscriptionId?.trim() ||
      ((sub.plan === "team" || sub.plan === "pro") &&
        ["active", "trialing", "past_due", "incomplete", "paused"].includes(sub.status));
    if (!billable) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setSubRetryKey((k) => k + 1);
    }, 35_000);
    return () => window.clearInterval(id);
  }, [selectedTeamId, sub]);

  const myRole = teams === null ? undefined : teams.find((t) => t.id === selectedTeamId)?.role;
  const isOwner = myRole === "owner";

  useEffect(() => {
    if (!isOwner) {
      setCheckoutCfg(null);
      return;
    }
    let cancelled = false;
    void fetchWebCheckoutConfig()
      .then((d) => {
        if (!cancelled) setCheckoutCfg(d);
      })
      .catch(() => {
        if (!cancelled) setCheckoutCfg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedTeamId]);

  const clearBillingParam = useCallback(() => {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("billing");
        n.delete("session_id");
        return n;
      },
      { replace: true },
    );
  }, [setParams]);

  const stripeActive =
    !!sub?.stripeSubscriptionId &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(sub.status);
  const mobileManaged =
    !!sub &&
    (sub.plan === "team" || sub.plan === "pro") &&
    sub.status === "active" &&
    !sub.stripeSubscriptionId;

  /** Portal works with customer id or subscription id (server resolves the billing customer). */
  const canOpenStripePortal =
    !!sub?.stripeCustomerId?.trim() || !!sub?.stripeSubscriptionId?.trim();

  const onSubscribe = useCallback(async () => {
    if (!selectedTeamId || !isOwner) return;
    setBusy(true);
    setActionErr(null);
    try {
      const { url } = await postWebBillingCheckout(selectedTeamId);
      window.location.href = url;
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Checkout failed.");
      setBusy(false);
    }
  }, [selectedTeamId, isOwner]);

  const onPortal = useCallback(async () => {
    if (!selectedTeamId || !isOwner) return;
    setBusy(true);
    setActionErr(null);
    try {
      const { url } = await postWebBillingPortal(selectedTeamId);
      window.location.href = url;
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not open billing portal.");
      setBusy(false);
    }
  }, [selectedTeamId, isOwner]);

  useEffect(() => {
    const subscribe = params.get("subscribe");
    if (subscribe !== "1") return;
    if (!teams?.length || !selectedTeamId || !isOwner || showPlanLoading || subErr || sub === null) return;
    if (checkoutCfg === null) return;
    if (!checkoutCfg.configured) {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("subscribe");
          return n;
        },
        { replace: true },
      );
      return;
    }
    if (stripeActive || mobileManaged) {
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("subscribe");
          return n;
        },
        { replace: true },
      );
      return;
    }
    if (autoCheckoutStarted.current) return;
    autoCheckoutStarted.current = true;
    void onSubscribe();
  }, [
    teams,
    selectedTeamId,
    isOwner,
    sub,
    subLoading,
    subErr,
    stripeActive,
    mobileManaged,
    params,
    setParams,
    onSubscribe,
    checkoutCfg,
  ]);

  const isActiveTeamPlan =
    !!sub &&
    (sub.plan === "team" || sub.plan === "pro") &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(sub.status);
  const currentPlanTier: "free" | "team" = isActiveTeamPlan ? "team" : "free";
  const workspaceName = teams?.find((t) => t.id === selectedTeamId)?.name ?? "Workspace";
  const showSubscribeCta = isOwner && !!sub && !stripeActive && !mobileManaged && currentPlanTier === "free";

  if (me === undefined) {
    return (
      <div className="enterprise-dashboard-inner" style={{ maxWidth: 960 }}>
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-dashboard-inner" style={{ maxWidth: 960 }}>
        {billingFlash === "success" ? (
          <div className="enterprise-card" style={{ marginBottom: 16, borderColor: "rgba(34,197,94,0.45)" }}>
            <p style={{ margin: 0 }}>Thanks — your payment is processing. It may take a moment for your plan to update.</p>
            <button type="button" className="enterprise-inline-link" style={{ marginTop: 12 }} onClick={clearBillingParam}>
              Dismiss
            </button>
          </div>
        ) : null}
        {billingFlash === "cancel" ? (
          <div className="enterprise-card" style={{ marginBottom: 16 }}>
            <p style={{ margin: 0 }}>Checkout was canceled. No charge was made.</p>
            <button type="button" className="enterprise-inline-link" style={{ marginTop: 12 }} onClick={clearBillingParam}>
              Dismiss
            </button>
          </div>
        ) : null}

        {actionErr ? (
          <p className="enterprise-form-error" role="alert" style={{ marginBottom: 16 }}>
            {actionErr}
          </p>
        ) : null}

        {/* Hero */}
        <header style={{ textAlign: "center", marginBottom: 8 }}>
          {showPlanLoading ? (
            <p className="enterprise-muted" style={{ marginBottom: 12 }}>
              Loading plan…
            </p>
          ) : null}
          <h1 className="enterprise-page-title" style={{ marginBottom: 8 }}>
            Choose the plan that fits your team
          </h1>
          <p className="enterprise-muted" style={{ maxWidth: 480, margin: "0 auto 8px", lineHeight: 1.5 }}>
            Simple pricing. No hidden fees. Cancel anytime. Subscriptions are per workspace — only the{" "}
            <strong>owner</strong> can start checkout or open the billing portal.
          </p>
          {!showPlanLoading && sub && subscriptionLine(sub, stripeActive) ? (
            <p className="enterprise-muted" style={{ fontSize: 14, marginTop: 4 }}>
              {subscriptionLine(sub, stripeActive)}
            </p>
          ) : null}
          <p className="enterprise-muted" style={{ fontSize: 14, marginTop: 6 }}>
            <strong>{workspaceName}</strong>
          </p>
        </header>

        {subErr ? (
          <div className="enterprise-card" role="alert" style={{ marginBottom: 20 }}>
            <p className="enterprise-form-error" style={{ marginBottom: 12 }}>
              {subErr}
            </p>
            <button type="button" className="enterprise-inline-link" onClick={() => setSubRetryKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {/* Two-column plans */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Free */}
          <section
            className="enterprise-card"
            style={{
              margin: 0,
              borderWidth: currentPlanTier === "free" && sub && !showPlanLoading ? 2 : 1,
              borderColor: currentPlanTier === "free" && sub && !showPlanLoading ? "#64748b" : undefined,
            }}
            aria-labelledby="billing-free-heading"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <h2 id="billing-free-heading" className="enterprise-card-title" style={{ marginBottom: 4 }}>
                  Free
                </h2>
                <p className="enterprise-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
                  Perfect for teams getting started
                </p>
              </div>
              {currentPlanTier === "free" && sub && !showPlanLoading ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: "#fff",
                    background: "#64748b",
                    padding: "5px 10px",
                    borderRadius: 999,
                  }}
                >
                  CURRENT
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#64748b" }}>$0</span>
              <span className="enterprise-muted" style={{ fontSize: 14, fontWeight: 600 }}>
                forever
              </span>
            </div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#94a3b8", marginTop: 18, marginBottom: 0 }}>
              INCLUDED
            </p>
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {FREE_INCLUDED.map((label) => (
                <li key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: "#e0f2fe",
                      color: "#0284c7",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck />
                  </span>
                  <span style={{ fontSize: 14, color: "#334155" }}>{label}</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#94a3b8", marginTop: 18, marginBottom: 0 }}>
              UNLOCK WITH TEAM
            </p>
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {FREE_LOCKED.map((label) => (
                <li key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: "#f1f5f9",
                      color: "#94a3b8",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconLock />
                  </span>
                  <span style={{ fontSize: 14, color: "#94a3b8" }}>{label}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 20 }}>
              <button type="button" className="auth-submit auth-submit--muted" disabled>
                {currentPlanTier === "free" ? "Current plan" : "Included in Team"}
              </button>
            </div>
          </section>

          {/* Team */}
          <section
            className="enterprise-card"
            style={{
              margin: 0,
              borderWidth: currentPlanTier === "team" && sub && !subLoading ? 2 : 1,
              borderColor: currentPlanTier === "team" && sub && !subLoading ? "#6366f1" : undefined,
            }}
            aria-labelledby="billing-team-heading"
          >
            {currentPlanTier !== "team" || showPlanLoading || !sub ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  marginBottom: 10,
                }}
              >
                <IconStar />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "#4f46e5" }}>MOST POPULAR</span>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: "#fff",
                    background: "#6366f1",
                    padding: "5px 10px",
                    borderRadius: 999,
                  }}
                >
                  CURRENT
                </span>
              </div>
            )}
            <h2 id="billing-team-heading" className="enterprise-card-title" style={{ marginBottom: 4 }}>
              Team
            </h2>
            <p className="enterprise-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              For fast-moving teams that need execution
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginTop: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#6366f1" }}>$19</span>
              <span className="enterprise-muted" style={{ fontSize: 14, fontWeight: 600 }}>
                per workspace / month
              </span>
            </div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#94a3b8", marginTop: 18, marginBottom: 0 }}>
              EVERYTHING IN FREE, PLUS
            </p>
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {TEAM_FEATURES.map((label) => (
                <li key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: "#eef2ff",
                      color: "#6366f1",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck />
                  </span>
                  <span style={{ fontSize: 14, color: "#334155" }}>{label}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 20 }}>
              {checkoutCfg && !checkoutCfg.configured && isOwner && currentPlanTier === "free" ? (
                <div
                  role="status"
                  style={{
                    marginBottom: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #fcd34d",
                    background: "#fffbeb",
                    fontSize: 13,
                    color: "#92400e",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Web checkout is not configured</strong> on this API server. That is typical in local
                  development until you set: {checkoutCfg.missingKeys.join(", ")} on the backend. For{" "}
                  <code style={{ fontSize: 12 }}>WEB_PUBLIC_URL</code>, use your Vite URL (for example{" "}
                  <code style={{ fontSize: 12 }}>http://127.0.0.1:5173</code>). Production uses the same variables on your
                  host (Railway, etc.). The API must have those variables wherever it runs — missing keys are not caused
                  only by running locally.
                </div>
              ) : null}
              {!showPlanLoading && sub && currentPlanTier === "team" ? (
                <button type="button" className="auth-submit auth-submit--team-current" disabled>
                  Current plan
                </button>
              ) : !showPlanLoading && sub ? (
                <>
                  {showSubscribeCta ? (
                    <button
                      type="button"
                      className="auth-submit"
                      disabled={busy || !!subErr || (checkoutCfg !== null && !checkoutCfg.configured)}
                      onClick={onSubscribe}
                    >
                      {busy ? "Opening checkout…" : "Upgrade to Team"}
                    </button>
                  ) : (
                    <button type="button" className="auth-submit auth-submit--muted" disabled style={{ cursor: "not-allowed" }}>
                      Upgrade to Team
                    </button>
                  )}
                  {isOwner ? (
                    <p className="enterprise-muted" style={{ textAlign: "center", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                      Cancel anytime · Secure checkout
                    </p>
                  ) : (
                    <p className="enterprise-muted" style={{ textAlign: "center", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                      Only the workspace owner can upgrade.
                    </p>
                  )}
                </>
              ) : (
                <p className="enterprise-muted" style={{ margin: 0 }}>
                  {showPlanLoading ? "Loading…" : "—"}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Status + actions */}
        <section className="enterprise-card" style={{ marginBottom: 20 }}>
          <h2 className="enterprise-card-title" style={{ fontSize: 16 }}>
            Billing actions
          </h2>
          {showPlanLoading ? (
            <p className="enterprise-muted">Loading subscription…</p>
          ) : sub && !subErr ? (
            <>
              <dl style={{ display: "grid", gap: "12px 24px", margin: "0 0 16px", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div>
                  <dt className="enterprise-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    Plan
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 600 }}>{planLabel(sub.plan)}</dd>
                </div>
                <div>
                  <dt className="enterprise-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    Status
                  </dt>
                  <dd style={{ margin: 0, textTransform: "capitalize" }}>{sub.status.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="enterprise-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    Renews or ends
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </dd>
                </div>
              </dl>
              {stripeActive ? (
                <p className="enterprise-muted" style={{ marginTop: 0, marginBottom: 16 }}>
                  Your team plan is billed on the web. Use <strong>Manage billing</strong> to update payment details or cancel.
                </p>
              ) : null}
              {mobileManaged ? (
                <div
                  className="enterprise-card"
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    padding: "16px 18px",
                    background: "var(--surface-muted)",
                    borderStyle: "solid",
                    borderWidth: 1,
                    borderColor: "var(--border)",
                  }}
                >
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    Subscription: Mobile app (app store billing)
                  </p>
                  <p className="enterprise-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                    This workspace is on Team through an in-app subscription (Apple App Store or Google Play). Billing,
                    payment methods, and plan changes for that purchase are handled by the platform—not through this web
                    administrator. To modify or cancel, sign in on the account that bought the subscription and open that
                    store&apos;s subscription settings (for example, <strong>Settings → Subscriptions</strong> on iOS, or
                    Google Play → Payments &amp; subscriptions on Android). To return this workspace to Free, cancel the Team
                    plan there; entitlement updates follow each platform&apos;s billing cycle.
                  </p>
                </div>
              ) : null}
            </>
          ) : !subErr ? (
            <p className="enterprise-muted">No subscription details loaded yet.</p>
          ) : null}

          {isOwner && !mobileManaged ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                className={stripeActive || canOpenStripePortal ? "auth-submit" : "auth-link-button"}
                style={{
                  minWidth: 220,
                  maxWidth: 360,
                  width: "100%",
                }}
                disabled={busy || !canOpenStripePortal || !!subErr || showPlanLoading}
                onClick={onPortal}
              >
                Manage billing
              </button>
            </div>
          ) : !isOwner ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <p className="enterprise-muted" style={{ margin: 0 }}>
                Ask a team owner to manage the subscription for this workspace.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
