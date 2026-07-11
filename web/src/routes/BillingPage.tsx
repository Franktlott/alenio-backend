import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { queryKeys } from "../lib/query-keys";
import {
  fetchWebTeamSubscription,
  postWebBillingCheckout,
  postWebBillingPortal,
  type WebTeamSubscription,
} from "../lib/api";
import { loadWebCheckoutConfig, peekWebCheckoutConfig, type WebCheckoutConfig } from "../lib/checkout-config-cache";
import {
  BILLING_COMPARE_FEATURES,
  FREE_INCLUDED,
  TEAM_PRICE_AMOUNT,
  TEAM_PRICE_PERIOD,
} from "../lib/plan-catalog";

function planLabel(plan: string): string {
  if (plan === "team" || plan === "pro") return "Team";
  return "Free";
}

function formatRenewalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function subscriptionLine(sub: WebTeamSubscription, stripeActive: boolean): string | null {
  if (stripeActive) {
    return "Billed on the web — use Manage billing to update payment or cancel.";
  }
  if (
    sub.currentPeriodEnd &&
    (sub.plan === "team" || sub.plan === "pro") &&
    ["active", "trialing", "past_due"].includes(sub.status)
  ) {
    return `Renews ${formatRenewalDate(sub.currentPeriodEnd)}`;
  }
  return null;
}

function CompareIcon({ included }: { included: boolean }) {
  return (
    <span
      className={`enterprise-billing-compare-icon ${included ? "enterprise-billing-compare-icon--yes" : "enterprise-billing-compare-icon--no"}`}
      aria-hidden
    >
      {included ? (
        <svg viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" fill="none">
          <path d="M3 6H9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutCfg, setCheckoutCfg] = useState<WebCheckoutConfig | null>(() => peekWebCheckoutConfig());
  const [checkoutCfgLoading, setCheckoutCfgLoading] = useState(() => peekWebCheckoutConfig() === null);
  const autoCheckoutStarted = useRef(false);

  const billingFlash = params.get("billing");
  const myRole = teams === null ? undefined : teams.find((t) => t.id === selectedTeamId)?.role;
  const isOwner = myRole === "owner";
  const teamListErr =
    teams && selectedTeamId && !teams.some((t) => t.id === selectedTeamId)
      ? "That workspace is not in your team list. Pick another workspace above."
      : null;

  const subQuery = useQuery({
    queryKey: queryKeys.teamSubscription(selectedTeamId),
    queryFn: () => fetchWebTeamSubscription(selectedTeamId),
    enabled: !!selectedTeamId && teams !== null && !!isOwner && !teamListErr,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!s) return false;
      const billable =
        !!s.stripeSubscriptionId?.trim() ||
        ((s.plan === "team" || s.plan === "pro") &&
          ["active", "trialing", "past_due", "incomplete", "paused"].includes(s.status));
      return billable ? 35_000 : false;
    },
  });

  const sub = subQuery.data ?? null;
  const subErr =
    teamListErr ??
    (subQuery.error instanceof Error
      ? subQuery.error.message
      : subQuery.isError
        ? "Could not load subscription."
        : null);
  const showPlanLoading = subQuery.isPending && !sub;
  const subLoading = subQuery.isFetching;

  /** After checkout redirect, webhooks can lag; refetch subscription until it reflects payment. */
  useEffect(() => {
    if (billingFlash !== "success" || !selectedTeamId) return;
    void subQuery.refetch();
    let n = 0;
    const max = 44;
    const id = window.setInterval(() => {
      n += 1;
      void subQuery.refetch();
      if (n >= max) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [billingFlash, selectedTeamId, subQuery]);

  useEffect(() => {
    if (!isOwner) {
      setCheckoutCfgLoading(false);
      return;
    }
    let cancelled = false;
    const cached = peekWebCheckoutConfig();
    if (cached) {
      setCheckoutCfg(cached);
      setCheckoutCfgLoading(false);
    } else {
      setCheckoutCfgLoading(true);
    }
    void loadWebCheckoutConfig()
      .then((d) => {
        if (!cancelled) setCheckoutCfg(d);
      })
      .finally(() => {
        if (!cancelled) setCheckoutCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

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
    if (checkoutCfgLoading || checkoutCfg === null) return;
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
    checkoutCfgLoading,
  ]);

  const isActiveTeamPlan =
    !!sub &&
    (sub.plan === "team" || sub.plan === "pro") &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(sub.status);
  const currentPlanTier: "free" | "team" = isActiveTeamPlan ? "team" : "free";
  const showSubscribeCta = isOwner && !!sub && !stripeActive && !mobileManaged && currentPlanTier === "free";
  const showCheckoutNotConfigured =
    !checkoutCfgLoading &&
    !!checkoutCfg &&
    !checkoutCfg.configured &&
    isOwner &&
    !showPlanLoading &&
    sub !== null &&
    currentPlanTier === "free";

  const premiumCount = BILLING_COMPARE_FEATURES.filter((f) => !f.free).length;
  const subLine = !showPlanLoading && sub ? subscriptionLine(sub, stripeActive) : null;

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell enterprise-tab-shell-billing">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="enterprise-tab-shell enterprise-tab-shell-billing">
      <div className="enterprise-billing-page">
        <div className="enterprise-billing-alerts">
          {billingFlash === "success" ? (
            <div className="enterprise-billing-alert enterprise-billing-alert--info" role="status">
              <p>Thanks — your payment is processing. It may take a moment for your plan to update.</p>
              <button type="button" className="enterprise-inline-link" onClick={clearBillingParam}>
                Dismiss
              </button>
            </div>
          ) : null}
          {billingFlash === "cancel" ? (
            <div className="enterprise-billing-alert enterprise-billing-alert--info" role="status">
              <p>Checkout was canceled. No charge was made.</p>
              <button type="button" className="enterprise-inline-link" onClick={clearBillingParam}>
                Dismiss
              </button>
            </div>
          ) : null}
          {actionErr ? (
            <p className="enterprise-billing-alert enterprise-billing-alert--error" role="alert">
              {actionErr}
            </p>
          ) : null}
          {subErr ? (
            <div className="enterprise-billing-alert enterprise-billing-alert--error" role="alert">
              <p>{subErr}</p>
              <button type="button" className="enterprise-inline-link" onClick={() => void subQuery.refetch()}>
                Try again
              </button>
            </div>
          ) : null}
        </div>

        <header className="enterprise-billing-header">
          <div className="enterprise-billing-header-copy">
            <h1>Billing</h1>
            <p>
              Simple pricing. No hidden fees. Cancel anytime. Subscriptions are per workspace — only the{" "}
              <strong>owner</strong> can start checkout or open the billing portal.
              {showPlanLoading ? " Loading plan…" : null}
              {subLine ? <> {subLine}</> : null}
            </p>
          </div>
        </header>

        <div className="enterprise-billing-main">
          <div className="enterprise-billing-plans">
            <article
              className={`enterprise-billing-plan${currentPlanTier === "free" && sub && !showPlanLoading ? " enterprise-billing-plan--current" : ""}`}
              aria-labelledby="billing-free-heading"
            >
              {currentPlanTier === "free" && sub && !showPlanLoading ? (
                <span className="enterprise-billing-plan-badge">Current</span>
              ) : null}
              <div className="enterprise-billing-plan-head">
                <h2 id="billing-free-heading" className="enterprise-billing-plan-name">
                  Free
                </h2>
                <p className="enterprise-billing-plan-tagline">Perfect for teams getting started</p>
              </div>
              <p className="enterprise-billing-plan-price">
                $0
                <span>forever</span>
              </p>
              <ul className="enterprise-billing-plan-highlights">
                {FREE_INCLUDED.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                className="enterprise-billing-plan-cta enterprise-billing-plan-cta--secondary"
                disabled
              >
                {currentPlanTier === "free" ? "Current plan" : "Included in Team"}
              </button>
            </article>

            <article
              className={`enterprise-billing-plan${currentPlanTier === "team" && sub && !subLoading ? " enterprise-billing-plan--current" : ""}`}
              aria-labelledby="billing-team-heading"
            >
              {currentPlanTier === "team" && sub && !showPlanLoading ? (
                <span className="enterprise-billing-plan-badge">Current</span>
              ) : (
                <span className="enterprise-billing-plan-badge enterprise-billing-plan-badge--popular">Popular</span>
              )}
              <div className="enterprise-billing-plan-head">
                <h2 id="billing-team-heading" className="enterprise-billing-plan-name">
                  Team
                </h2>
                <p className="enterprise-billing-plan-tagline">For fast-moving teams that need execution</p>
              </div>
              <p className="enterprise-billing-plan-price enterprise-billing-plan-price--accent">
                {TEAM_PRICE_AMOUNT}
                <span>{TEAM_PRICE_PERIOD}</span>
              </p>
              <ul className="enterprise-billing-plan-highlights">
                <li>All Free features</li>
                <li>{premiumCount} premium capabilities</li>
              </ul>
              {showCheckoutNotConfigured ? (
                <div className="enterprise-billing-checkout-warn" role="status">
                  <strong>Web checkout is not configured</strong> on this API server. Set{" "}
                  {checkoutCfg?.missingKeys.join(", ")} on the backend (including{" "}
                  <code>WEB_PUBLIC_URL</code> for your Vite URL).
                </div>
              ) : null}
              {!showPlanLoading && sub && currentPlanTier === "team" ? (
                <button
                  type="button"
                  className="enterprise-billing-plan-cta enterprise-billing-plan-cta--current"
                  disabled
                >
                  Current plan
                </button>
              ) : !showPlanLoading && sub ? (
                <>
                  {showSubscribeCta ? (
                    <button
                      type="button"
                      className="enterprise-billing-plan-cta enterprise-billing-plan-cta--primary"
                      disabled={
                        busy || !!subErr || checkoutCfgLoading || (checkoutCfg !== null && !checkoutCfg.configured)
                      }
                      onClick={onSubscribe}
                    >
                      {busy ? "Opening checkout…" : "Upgrade to Team"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="enterprise-billing-plan-cta enterprise-billing-plan-cta--secondary"
                      disabled
                    >
                      Upgrade to Team
                    </button>
                  )}
                  <p className="enterprise-billing-plan-footnote">
                    {isOwner ? "Cancel anytime · Secure checkout" : "Only the workspace owner can upgrade."}
                  </p>
                </>
              ) : (
                <p className="enterprise-billing-plan-footnote">{showPlanLoading ? "Loading…" : "—"}</p>
              )}
            </article>
          </div>

          <aside className="enterprise-billing-sidebar">
            <div className="enterprise-billing-subscription">
              <h3 className="enterprise-billing-subscription-title">Subscription</h3>
              {showPlanLoading ? (
                <p className="enterprise-billing-plan-footnote">Loading subscription…</p>
              ) : sub && !subErr ? (
                <>
                  <dl className="enterprise-billing-subscription-dl">
                    <div className="enterprise-billing-subscription-row">
                      <dt>Plan</dt>
                      <dd>{planLabel(sub.plan)}</dd>
                    </div>
                    <div className="enterprise-billing-subscription-row">
                      <dt>Status</dt>
                      <dd>
                        <span
                          className={`enterprise-billing-subscription-status${
                            ["active", "trialing"].includes(sub.status) ? "" : " enterprise-billing-subscription-status--inactive"
                          }`}
                        >
                          <span className="enterprise-billing-subscription-status-dot" aria-hidden />
                          <span style={{ textTransform: "capitalize" }}>{sub.status.replace(/_/g, " ")}</span>
                        </span>
                      </dd>
                    </div>
                    <div className="enterprise-billing-subscription-row">
                      <dt>Renews or ends</dt>
                      <dd>{formatRenewalDate(sub.currentPeriodEnd)}</dd>
                    </div>
                  </dl>
                  {mobileManaged ? (
                    <div className="enterprise-billing-mobile-notice">
                      <p className="enterprise-billing-mobile-notice-title">Active Team plan</p>
                      <p>
                        This workspace has an active Team plan that is not managed through web Stripe billing. Cancel or
                        change it in Plan & Access on mobile, or contact support if you need help.
                      </p>
                    </div>
                  ) : null}
                  {isOwner && !mobileManaged ? (
                    <button
                      type="button"
                      className="enterprise-billing-manage-btn"
                      disabled={busy || !canOpenStripePortal || !!subErr || showPlanLoading}
                      onClick={onPortal}
                    >
                      {busy ? "Opening…" : "Manage billing"}
                    </button>
                  ) : !isOwner ? (
                    <p className="enterprise-billing-plan-footnote">
                      Ask a team owner to manage the subscription for this workspace.
                    </p>
                  ) : null}
                </>
              ) : !subErr ? (
                <p className="enterprise-billing-plan-footnote">No subscription details loaded yet.</p>
              ) : null}
            </div>
          </aside>

          <section className="enterprise-billing-compare" aria-label="Plan comparison">
            <div className="enterprise-billing-compare-head">
              <span>Feature</span>
              <span>Free</span>
              <span>Team</span>
            </div>
            <div className="enterprise-billing-compare-body">
              {BILLING_COMPARE_FEATURES.map((row) => (
                <div key={row.name} className="enterprise-billing-compare-row">
                  <span className="enterprise-billing-compare-feature">{row.name}</span>
                  <span className="enterprise-billing-compare-cell">
                    <CompareIcon included={row.free} />
                  </span>
                  <span className="enterprise-billing-compare-cell">
                    <CompareIcon included />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
