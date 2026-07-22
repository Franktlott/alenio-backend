import Stripe from "stripe";
import { prisma } from "../prisma";
import { env } from "../env";
import { getTeamSubscription } from "../routes/subscription";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY?.trim()) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY.trim(), {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return stripeClient;
}

export function billingReturnBaseUrl(): string | null {
  const u = env.WEB_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return u || null;
}

/** Checkout requires at least one recurring price ID; portal and webhooks only need the Stripe client (+ return URL for portal). */
export function isStripeCheckoutConfigured(): boolean {
  return !!(
    getStripeClient() &&
    billingReturnBaseUrl() &&
    (env.STRIPE_TEAM_PRICE_ID?.trim() || env.STRIPE_OPERATIONS_PRICE_ID?.trim())
  );
}

export type StripeCheckoutPlan = "pro" | "operations";

export function stripePriceIdForCheckoutPlan(plan: StripeCheckoutPlan): string | null {
  if (plan === "operations") return env.STRIPE_OPERATIONS_PRICE_ID?.trim() || null;
  return env.STRIPE_TEAM_PRICE_ID?.trim() || null;
}

export function isStripeCheckoutPlanConfigured(plan: StripeCheckoutPlan): boolean {
  return !!(getStripeClient() && billingReturnBaseUrl() && stripePriceIdForCheckoutPlan(plan));
}

/** Persist Pro as `team` (legacy DB value); Operations as `operations`. */
export function dbPlanForCheckoutPlan(plan: StripeCheckoutPlan): "team" | "operations" {
  return plan === "operations" ? "operations" : "team";
}

export function planFromStripePriceId(priceId: string | null | undefined): "team" | "operations" {
  const id = priceId?.trim() ?? "";
  const ops = env.STRIPE_OPERATIONS_PRICE_ID?.trim();
  if (ops && id && id === ops) return "operations";
  return "team";
}

export function planFromStripeSubscription(subscription: Stripe.Subscription): "team" | "operations" {
  const meta = subscription.metadata?.plan?.trim().toLowerCase();
  if (meta === "operations") return "operations";
  if (meta === "team" || meta === "pro") return "team";

  for (const item of subscription.items?.data ?? []) {
    const price = item.price;
    const priceId = typeof price === "string" ? price : price?.id;
    if (priceId) {
      const mapped = planFromStripePriceId(priceId);
      if (mapped === "operations") return "operations";
    }
  }
  return "team";
}

export function isStripePortalConfigured(): boolean {
  return !!(getStripeClient() && billingReturnBaseUrl());
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const data = subscription.items?.data;
  if (data?.length) {
    const maxEnd = Math.max(...data.map((i) => i.current_period_end));
    if (Number.isFinite(maxEnd)) return new Date(maxEnd * 1000);
  }
  if (subscription.status === "trialing" && subscription.trial_end) {
    return new Date(subscription.trial_end * 1000);
  }
  return null;
}

/** Active Stripe sub scheduled to end (portal cancel-at-period-end or cancel_at timestamp). */
export function isStripeSubscriptionCanceling(subscription: Stripe.Subscription): boolean {
  if (subscription.cancel_at_period_end === true) return true;
  const cancelAt = subscription.cancel_at;
  if (cancelAt != null && ["active", "trialing"].includes(subscription.status)) {
    return cancelAt * 1000 > Date.now();
  }
  return false;
}

/**
 * Persist team subscription from a Stripe Subscription object (webhooks + checkout completion).
 */
export async function applySubscriptionFromStripeSubscription(
  teamId: string,
  customerId: string | null,
  subscription: Stripe.Subscription,
): Promise<void> {
  await getTeamSubscription(teamId);

  const previous = await prisma.teamSubscription.findUnique({
    where: { teamId },
    select: { plan: true, status: true, team: { select: { name: true } } },
  });

  const stripeStatus = subscription.status;
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);

  let plan = "free";
  let status = "canceled";
  let subId: string | null = subscription.id;
  let cancelAtPeriodEnd = false;

  if (stripeStatus === "active" || stripeStatus === "trialing") {
    plan = planFromStripeSubscription(subscription);
    status = "active";
    cancelAtPeriodEnd = isStripeSubscriptionCanceling(subscription);
  } else if (stripeStatus === "past_due") {
    plan = planFromStripeSubscription(subscription);
    status = "past_due";
  } else if (stripeStatus === "incomplete" || stripeStatus === "paused") {
    // Checkout often lands here briefly before `active`; persist Stripe ids so the app + webhooks can converge.
    plan = planFromStripeSubscription(subscription);
    status = stripeStatus;
  } else if (
    stripeStatus === "canceled" ||
    stripeStatus === "unpaid" ||
    stripeStatus === "incomplete_expired"
  ) {
    plan = "free";
    status = "canceled";
    subId = null;
  }

  const baseData = {
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    stripeSubscriptionId: subId,
    plan,
    status,
    currentPeriodEnd,
  };

  try {
    await prisma.teamSubscription.update({
      where: { teamId },
      data: { ...baseData, cancelAtPeriodEnd },
    });
  } catch (err) {
    console.warn("[stripe] cancelAtPeriodEnd column unavailable, persisting without it:", err);
    await prisma.teamSubscription.update({
      where: { teamId },
      data: baseData,
    });
  }

  const teamName = previous?.team.name ?? "Workplace";
  const { notifyAdminsBillingChange } = await import("./admin-push");
  void notifyAdminsBillingChange({
    teamId,
    teamName,
    plan,
    status,
    previousPlan: previous?.plan,
    previousStatus: previous?.status,
  }).catch((err) => console.warn("[stripe-billing] admin push failed", err));
}

export function stripeCustomerIdOfSubscription(subscription: Stripe.Subscription): string | null {
  const c = subscription.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "deleted" in c && (c as { deleted?: boolean }).deleted) return null;
  if (c && typeof c === "object" && "id" in c) return (c as { id: string }).id;
  return null;
}

/**
 * Billing portal requires a Stripe customer id. Some webhook paths only persisted the subscription id;
 * resolve the customer from Stripe and save it so portal + UI work.
 */
export async function ensureStripeCustomerIdForTeam(teamId: string): Promise<string | null> {
  const row = await getTeamSubscription(teamId);
  const existing = row.stripeCustomerId?.trim();
  if (existing) return existing;
  const subId = row.stripeSubscriptionId?.trim();
  if (!subId) return null;
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    const subscription = await stripe.subscriptions.retrieve(subId);
    const customerId = stripeCustomerIdOfSubscription(subscription);
    if (!customerId) return null;
    await prisma.teamSubscription.update({
      where: { teamId },
      data: { stripeCustomerId: customerId },
    });
    return customerId;
  } catch (e) {
    console.warn("[stripe-billing] ensureStripeCustomerIdForTeam failed", teamId, e);
    return null;
  }
}

/**
 * Pull the latest Stripe subscription for this team and persist it (for missed webhooks or pre-fix checkouts).
 */
export async function reconcileTeamStripeSubscription(teamId: string): Promise<{
  applied: boolean;
  message: string;
}> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { applied: false, message: "Web billing is not configured on this server." };
  }

  const row = await getTeamSubscription(teamId);

  const apply = async (subscription: Stripe.Subscription) => {
    const customerId = stripeCustomerIdOfSubscription(subscription);
    await applySubscriptionFromStripeSubscription(teamId, customerId, subscription);
  };

  const activeLike = (s: Stripe.Subscription) =>
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(s.status);

  if (row.stripeSubscriptionId?.trim()) {
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId.trim(), { expand: ["items.data"] });
      await apply(sub);
      return { applied: true, message: "Subscription refreshed from billing." };
    } catch (e) {
      console.warn("[stripe/reconcile] retrieve by stored subscription id failed", e);
    }
  }

  if (row.stripeCustomerId?.trim()) {
    const custId = row.stripeCustomerId.trim();
    const subs = await stripe.subscriptions.list({ customer: custId, status: "all", limit: 30 });
    const match =
      subs.data.find((s) => (s.metadata?.team_id?.trim() ?? "") === teamId) ||
      subs.data.find((s) => ["active", "trialing", "past_due", "incomplete", "paused"].includes(s.status));
    if (match) {
      await apply(match);
      return { applied: true, message: "Subscription found for this team’s billing customer and saved." };
    }
    return {
      applied: false,
      message:
        "This workspace has a billing customer id but no matching subscription. In your billing dashboard, confirm subscription status, or add metadata team_id on the subscription to this team’s id.",
    };
  }

  const owner = await prisma.teamMember.findFirst({
    where: { teamId, role: "owner" },
    include: { user: { select: { email: true } } },
  });
  const email = owner?.user?.email?.trim();
  const ownerUserId = owner?.userId ?? null;
  if (!email || !ownerUserId) {
    return { applied: false, message: "No team owner email found to look up billing customers." };
  }

  const customers = await stripe.customers.list({ email, limit: 15 });
  for (const cust of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 30 });
    const withTeam = subs.data.find((s) => (s.metadata?.team_id?.trim() ?? "") === teamId);
    if (withTeam) {
      await apply(withTeam);
      return { applied: true, message: "Subscription matched by owner email and subscription metadata team_id." };
    }
  }

  /** Billing customer email can differ from the team owner email in Neon; metadata team_id is authoritative. */
  try {
    const escaped = teamId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const search = await stripe.subscriptions.search({
      query: `metadata['team_id']:'${escaped}'`,
      limit: 10,
    });
    if (search.data.length > 0) {
      const picked = search.data.find((s) => activeLike(s)) ?? search.data[0]!;
      await apply(picked);
      return {
        applied: true,
        message:
          "Subscription matched by metadata team_id (owner email did not have to match the billing customer email).",
      };
    }
  } catch (e) {
    console.warn("[stripe/reconcile] subscriptions.search by team_id failed:", e);
  }

  const candidates: Stripe.Subscription[] = [];
  for (const cust of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 30 });
    for (const s of subs.data) {
      if (activeLike(s)) candidates.push(s);
    }
  }

  const ownedTeams = await prisma.teamMember.findMany({
    where: { userId: ownerUserId, role: "owner" },
    select: { teamId: true },
  });
  if (ownedTeams.length === 1 && ownedTeams[0]!.teamId === teamId && candidates.length === 1) {
    await apply(candidates[0]!);
    return {
      applied: true,
      message:
        "Linked your only active subscription on this billing email to this workspace (no team_id metadata was required).",
    };
  }

  return {
    applied: false,
    message:
      ownedTeams.length > 1 && candidates.length > 0
        ? "There are one or more subscriptions on your email, but this account owns multiple workspaces. In your billing provider, open the subscription → Metadata, set team_id to this workspace’s id, then sync again."
        : candidates.length === 0
          ? "No active subscriptions found for the team owner’s email in this billing account. Confirm test vs live mode and that the subscription uses the same email."
          : "Could not safely match a subscription to this workspace. In your billing dashboard, open the subscription → Metadata → add team_id with this workspace’s id, then reload Plan.",
  };
}

const subscriptionReadReconcileCooldownMs = 10_000;
const lastSubscriptionReadReconcileAt = new Map<string, number>();

export type StripeBillingInterval = "month" | "year";

export type StripeSubscriptionSyncResult = {
  cancelAtPeriodEnd: boolean;
  billingInterval: StripeBillingInterval | null;
};

export function billingIntervalFromStripeSubscription(
  subscription: Stripe.Subscription,
): StripeBillingInterval | null {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const recurring = price && typeof price === "object" ? price.recurring : null;
  const interval = recurring?.interval;
  if (interval === "month" || interval === "year") return interval;
  return null;
}

/** Pull cancel-at-period-end + billing interval from Stripe and persist subscription row. */
export async function syncSubscriptionDetailsFromStripe(teamId: string): Promise<StripeSubscriptionSyncResult> {
  const row = await getTeamSubscription(teamId);
  const subId = row.stripeSubscriptionId?.trim();
  const stripe = getStripeClient();
  if (!subId || !stripe) {
    return { cancelAtPeriodEnd: row.cancelAtPeriodEnd === true, billingInterval: null };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
    const customerId = stripeCustomerIdOfSubscription(subscription);
    await applySubscriptionFromStripeSubscription(teamId, customerId, subscription);
    return {
      cancelAtPeriodEnd: isStripeSubscriptionCanceling(subscription),
      billingInterval: billingIntervalFromStripeSubscription(subscription),
    };
  } catch (e) {
    console.warn("[stripe] syncSubscriptionDetailsFromStripe failed", teamId, e);
    const refreshed = await getTeamSubscription(teamId);
    return { cancelAtPeriodEnd: refreshed.cancelAtPeriodEnd === true, billingInterval: null };
  }
}

export async function syncCancelAtPeriodEndFromStripe(teamId: string): Promise<boolean> {
  const result = await syncSubscriptionDetailsFromStripe(teamId);
  return result.cancelAtPeriodEnd;
}

/**
 * Best-effort pull from Stripe when the app reads subscription (Plan page, mobile layout).
 * Throttled per team to avoid hammering Stripe when the UI polls. Webhooks remain primary.
 */
export async function reconcileStripeForSubscriptionRead(teamId: string): Promise<void> {
  if (!getStripeClient()) return;
  const now = Date.now();
  const prev = lastSubscriptionReadReconcileAt.get(teamId) ?? 0;
  if (now - prev < subscriptionReadReconcileCooldownMs) return;
  lastSubscriptionReadReconcileAt.set(teamId, now);
  try {
    await reconcileTeamStripeSubscription(teamId);
  } catch (e) {
    console.warn("[stripe/reconcile-read] failed", teamId, e);
  }
}
