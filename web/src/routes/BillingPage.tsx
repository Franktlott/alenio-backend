import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { AlenioNoticeModal } from "../components/AlenioNoticeModal";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { queryKeys } from "../lib/query-keys";
import {
  fetchWebTeamSubscription,
  postWebBillingCheckout,
  postWebBillingPortal,
} from "../lib/api";
import { loadWebCheckoutConfig, peekWebCheckoutConfig, type WebCheckoutConfig } from "../lib/checkout-config-cache";
import { LEGAL_CONTACT_EMAIL } from "../lib/legal-constants";

const FREE_FEATURES = ["Activity feed", "Team chat", "Team members (limited)"] as const;
const PRO_CARD_FEATURES = [
  "Tasks & action items",
  "Seneca AI coaching",
  "Check-ins & development plans",
  "Team calendar & Outlook sync",
  "Metrics & dashboards",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;
const OPS_CARD_FEATURES = [
  "Alenio Go (checklists, walks, briefs)",
  "Temperature checks",
  "Shift briefings & cascades",
  "Workflow execution tools",
  "Floor-ready ops workflows",
  "Everything in Pro",
] as const;

function planLabel(plan: string): string {
  if (plan === "operations") return "Operations";
  if (plan === "team" || plan === "pro") return "Pro";
  return "Free";
}

function formatRenewalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CheckIcon() {
  return (
    <span className="billing-check" aria-hidden>
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 8.25 6.6 11.25 12.5 4.75"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 4h6v6M10 14 20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 17.5V8.75A2.75 2.75 0 0 1 7.75 6h8.5A2.75 2.75 0 0 1 19 8.75v5A2.75 2.75 0 0 1 16.25 16.5H9.2L5 19.5v-2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NoticeState = {
  title: string;
  message: string;
  tone: "info" | "success" | "error";
  confirmLabel?: string;
} | null;

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const { me, teams, selectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<"pro" | "operations" | "portal" | null>(null);
  const [checkoutCfg, setCheckoutCfg] = useState<WebCheckoutConfig | null>(() => peekWebCheckoutConfig());
  const [checkoutCfgLoading, setCheckoutCfgLoading] = useState(() => peekWebCheckoutConfig() === null);
  const [dismissedFlash, setDismissedFlash] = useState(false);
  const [dismissedSubErr, setDismissedSubErr] = useState(false);
  const [configNoticeOpen, setConfigNoticeOpen] = useState(false);
  const autoCheckoutStarted = useRef(false);

  const billingFlash = params.get("billing");
  const myRole = teams === null ? undefined : teams.find((t) => t.id === selectedTeamId)?.role;
  const isOwner = myRole === "owner";
  const busy = busyPlan !== null;
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
        ((s.plan === "team" || s.plan === "pro" || s.plan === "operations") &&
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

  useEffect(() => {
    if (billingFlash !== "success" || !selectedTeamId) return;
    void subQuery.refetch();
    void refreshMeAndTeams?.();
    let n = 0;
    const max = 44;
    const id = window.setInterval(() => {
      n += 1;
      void subQuery.refetch();
      if (n >= max) window.clearInterval(id);
    }, 2000);
    return () => window.clearInterval(id);
  }, [billingFlash, selectedTeamId, subQuery, refreshMeAndTeams]);

  useEffect(() => {
    if (!isOwner) {
      setCheckoutCfgLoading(false);
      return;
    }
    let cancelled = false;
    setCheckoutCfgLoading(true);
    void loadWebCheckoutConfig({ force: true })
      .then((d) => {
        if (!cancelled) setCheckoutCfg(d);
      })
      .finally(() => {
        if (!cancelled) setCheckoutCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedTeamId]);

  const clearBillingParam = useCallback(() => {
    setDismissedFlash(true);
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
    (sub.plan === "team" || sub.plan === "pro" || sub.plan === "operations") &&
    sub.status === "active" &&
    !sub.stripeSubscriptionId;

  const canOpenStripePortal =
    !!sub?.stripeCustomerId?.trim() || !!sub?.stripeSubscriptionId?.trim();

  const onSubscribe = useCallback(
    async (plan: "pro" | "operations") => {
      if (!selectedTeamId || !isOwner) return;
      setBusyPlan(plan);
      setActionErr(null);
      try {
        const result = await postWebBillingCheckout(selectedTeamId, plan);
        if (result.upgraded) {
          await Promise.all([subQuery.refetch(), refreshMeAndTeams?.()].filter(Boolean));
          setBusyPlan(null);
          return;
        }
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        setActionErr("Checkout did not return a URL.");
        setBusyPlan(null);
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : "Checkout failed.");
        setBusyPlan(null);
      }
    },
    [selectedTeamId, isOwner, subQuery, refreshMeAndTeams],
  );

  const onPortal = useCallback(async () => {
    if (!selectedTeamId || !isOwner) return;
    setBusyPlan("portal");
    setActionErr(null);
    try {
      const { url } = await postWebBillingPortal(selectedTeamId);
      window.location.href = url;
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not open billing portal.");
      setBusyPlan(null);
    }
  }, [selectedTeamId, isOwner]);

  useEffect(() => {
    const subscribe = params.get("subscribe");
    if (subscribe !== "1") return;
    if (!teams?.length || !selectedTeamId || !isOwner || showPlanLoading || subErr || sub === null) return;
    if (checkoutCfgLoading || checkoutCfg === null) return;
    if (!checkoutCfg.configured || checkoutCfg.plans?.pro === false) {
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
    void onSubscribe("pro");
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
    showPlanLoading,
  ]);

  const paidActive =
    !!sub &&
    (sub.plan === "team" || sub.plan === "pro" || sub.plan === "operations") &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(sub.status);
  const currentPlanTier: "free" | "pro" | "operations" = !paidActive
    ? "free"
    : sub!.plan === "operations"
      ? "operations"
      : "pro";

  const proCheckoutReady = checkoutCfg?.plans?.pro !== false && !!checkoutCfg?.configured;
  const operationsCheckoutReady = !!checkoutCfg?.plans?.operations;
  const canCheckoutPro =
    isOwner && !!sub && !mobileManaged && currentPlanTier === "free" && proCheckoutReady;
  const canCheckoutOperations =
    isOwner &&
    !!sub &&
    !mobileManaged &&
    currentPlanTier !== "operations" &&
    (currentPlanTier === "free" || stripeActive);
  const showCheckoutNotConfigured =
    !checkoutCfgLoading &&
    !!checkoutCfg &&
    !checkoutCfg.configured &&
    isOwner &&
    !showPlanLoading &&
    sub !== null &&
    currentPlanTier === "free";

  const notice: NoticeState = useMemo(() => {
    if (actionErr) {
      return { title: "Couldn't complete checkout", message: actionErr, tone: "error", confirmLabel: "Close" };
    }
    if (subErr && !dismissedSubErr) {
      return { title: "Couldn't load subscription", message: subErr, tone: "error", confirmLabel: "Close" };
    }
    if (!dismissedFlash && billingFlash === "success") {
      const firstName = me?.name?.trim().split(/\s+/)[0];
      return {
        title: firstName ? `Welcome, ${firstName}` : "Welcome to Alenio",
        message:
          "You're all set. Your workspace is unlocking now — this usually takes just a moment.",
        tone: "success",
        confirmLabel: "Get started",
      };
    }
    if (!dismissedFlash && billingFlash === "cancel") {
      return {
        title: "Checkout canceled",
        message: "No charge was made. You can upgrade anytime when you're ready.",
        tone: "info",
        confirmLabel: "Back to billing",
      };
    }
    if (configNoticeOpen) {
      return {
        title: "Checkout not configured",
        message:
          "Web checkout is not configured on this server yet. Add your Stripe keys on the backend to enable checkout.",
        tone: "info",
        confirmLabel: "Got it",
      };
    }
    return null;
  }, [actionErr, subErr, dismissedSubErr, billingFlash, dismissedFlash, configNoticeOpen, me?.name]);

  const closeNotice = useCallback(() => {
    if (actionErr) {
      setActionErr(null);
      return;
    }
    if (subErr && !dismissedSubErr) {
      setDismissedSubErr(true);
      return;
    }
    if (!dismissedFlash && (billingFlash === "success" || billingFlash === "cancel")) {
      clearBillingParam();
      return;
    }
    if (configNoticeOpen) setConfigNoticeOpen(false);
  }, [actionErr, subErr, dismissedSubErr, billingFlash, dismissedFlash, configNoticeOpen, clearBillingParam]);

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell billing-shell">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  const supportHref = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Alenio billing support")}`;
  const planIsPaid = currentPlanTier === "pro" || currentPlanTier === "operations";

  return (
    <div className="enterprise-tab-shell billing-shell">
      <div className="billing-page">
        <header className="billing-hero">
          <div className="billing-hero-copy">
            <h1 className="billing-hero-title">Choose the right plan for your team</h1>
            <p className="billing-hero-sub">Per workspace · Cancel anytime · Only the owner can checkout</p>
          </div>

          <aside className="billing-sub-card" aria-label="Current subscription">
            {showPlanLoading ? (
              <p className="billing-muted">Loading…</p>
            ) : sub && !subErr ? (
              <>
                <div className="billing-sub-grid">
                  <div>
                    <span className="billing-sub-k">Plan</span>
                    <strong className={planIsPaid ? "billing-sub-plan-accent" : undefined}>
                      {planLabel(sub.plan)}
                    </strong>
                  </div>
                  <div>
                    <span className="billing-sub-k">Status</span>
                    <strong className="billing-sub-status">
                      <span
                        className={`billing-sub-dot${
                          ["active", "trialing"].includes(sub.status) ? "" : " billing-sub-dot--off"
                        }`}
                        aria-hidden
                      />
                      {sub.status.replace(/_/g, " ")}
                    </strong>
                  </div>
                  <div>
                    <span className="billing-sub-k">Renews</span>
                    <strong>{formatRenewalDate(sub.currentPeriodEnd)}</strong>
                  </div>
                </div>
                {isOwner && !mobileManaged ? (
                  <button
                    type="button"
                    className="billing-sub-manage"
                    disabled={busy || !canOpenStripePortal || showPlanLoading}
                    onClick={() => void onPortal()}
                  >
                    {busyPlan === "portal" ? "Opening…" : "Manage plan"}
                    <ExternalIcon />
                  </button>
                ) : null}
              </>
            ) : (
              <p className="billing-muted">{isOwner ? "No subscription loaded." : "Only the owner can manage billing."}</p>
            )}
          </aside>
        </header>

        <div className="billing-plans">
          <article
            className={`billing-card${currentPlanTier === "free" ? " billing-card--current" : ""}`}
            aria-labelledby="billing-free-heading"
          >
            <div className="billing-card-head">
              <h2 id="billing-free-heading" className="billing-card-name">
                Free
              </h2>
              <p className="billing-card-tag">Get started at no cost</p>
            </div>
            <p className="billing-card-price">
              $0 <span>forever</span>
            </p>
            <ul className="billing-card-features">
              {FREE_FEATURES.map((f) => (
                <li key={f}>
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="billing-cta billing-cta--outline" disabled>
              {currentPlanTier === "free" ? "Current plan" : "Included in Pro"}
            </button>
          </article>

          <article
            className={`billing-card billing-card--pro${currentPlanTier === "pro" ? " billing-card--current" : ""}`}
            aria-labelledby="billing-pro-heading"
          >
            <span className="billing-badge billing-badge--popular">Most popular</span>
            <div className="billing-card-head">
              <h2 id="billing-pro-heading" className="billing-card-name">
                Pro
              </h2>
              <p className="billing-card-tag">Everything you need to lead</p>
            </div>
            <p className="billing-card-price">
              $39.99
              <span className="billing-card-price-period">/ workspace / month</span>
            </p>
            <ul className="billing-card-features">
              {PRO_CARD_FEATURES.map((f) => (
                <li key={f}>
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {currentPlanTier === "pro" ? (
              <button type="button" className="billing-cta billing-cta--current" disabled>
                Current plan
              </button>
            ) : currentPlanTier === "operations" ? (
              <button type="button" className="billing-cta billing-cta--outline" disabled>
                Included in Operations
              </button>
            ) : (
              <button
                type="button"
                className="billing-cta billing-cta--primary"
                disabled={
                  busy ||
                  !!subErr ||
                  checkoutCfgLoading ||
                  showPlanLoading ||
                  (!canCheckoutPro && !showCheckoutNotConfigured)
                }
                onClick={() => {
                  if (showCheckoutNotConfigured || !proCheckoutReady) {
                    setConfigNoticeOpen(true);
                    return;
                  }
                  void onSubscribe("pro");
                }}
              >
                {busyPlan === "pro" ? "Opening…" : "Upgrade to Pro"}
              </button>
            )}
          </article>

          <article
            className={`billing-card${currentPlanTier === "operations" ? " billing-card--current" : ""}`}
            aria-labelledby="billing-ops-heading"
          >
            <div className="billing-card-head">
              <div className="billing-card-name-row">
                <h2 id="billing-ops-heading" className="billing-card-name">
                  Operations
                </h2>
                <AlenioGoLogo variant="nav" className="billing-go-logo" />
                <span className="billing-badge billing-badge--ops">Go</span>
              </div>
              <p className="billing-card-tag">Advanced tools for high performing teams</p>
            </div>
            <p className="billing-card-price">
              $69.99
              <span className="billing-card-price-period">/ workspace / month</span>
            </p>
            <ul className="billing-card-features">
              {OPS_CARD_FEATURES.map((f) => (
                <li key={f}>
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {currentPlanTier === "operations" ? (
              <button type="button" className="billing-cta billing-cta--current" disabled>
                Current plan
              </button>
            ) : (
              <button
                type="button"
                className="billing-cta billing-cta--outline-dark"
                disabled={busy || !!subErr || checkoutCfgLoading || showPlanLoading || !canCheckoutOperations}
                onClick={() => {
                  if (!operationsCheckoutReady) {
                    setActionErr(
                      "Operations checkout is not configured on this server yet. Add STRIPE_OPERATIONS_PRICE_ID on Railway (same service as STRIPE_TEAM_PRICE_ID), then redeploy.",
                    );
                    return;
                  }
                  void onSubscribe("operations");
                }}
              >
                {busyPlan === "operations"
                  ? currentPlanTier === "pro"
                    ? "Upgrading…"
                    : "Opening…"
                  : currentPlanTier === "pro"
                    ? "Upgrade to Operations"
                    : "Start Operations"}
              </button>
            )}
          </article>
        </div>

        <div className="billing-help">
          <div className="billing-help-copy">
            <span className="billing-help-icon" aria-hidden>
              <ChatIcon />
            </span>
            <p>
              <strong>Need help choosing a plan?</strong> Our team is here to help you find the perfect fit.
            </p>
          </div>
          <a className="billing-help-cta" href={supportHref}>
            Contact support
            <ExternalIcon />
          </a>
        </div>
      </div>

      <AlenioNoticeModal
        open={!!notice}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        confirmLabel={notice?.confirmLabel}
        onClose={closeNotice}
      />
    </div>
  );
}
