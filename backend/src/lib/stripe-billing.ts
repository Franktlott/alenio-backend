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

/** Checkout requires a recurring price ID; portal and webhooks only need the Stripe client (+ return URL for portal). */
export function isStripeCheckoutConfigured(): boolean {
  return !!(getStripeClient() && env.STRIPE_TEAM_PRICE_ID?.trim() && billingReturnBaseUrl());
}

export function isStripePortalConfigured(): boolean {
  return !!(getStripeClient() && billingReturnBaseUrl());
}

/**
 * Persist team subscription from a Stripe Subscription object (webhooks + checkout completion).
 */
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

export async function applySubscriptionFromStripeSubscription(
  teamId: string,
  customerId: string | null,
  subscription: Stripe.Subscription,
): Promise<void> {
  await getTeamSubscription(teamId);

  const stripeStatus = subscription.status;
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);

  let plan = "free";
  let status = "canceled";
  let subId: string | null = subscription.id;

  if (stripeStatus === "active" || stripeStatus === "trialing") {
    plan = "team";
    status = "active";
  } else if (stripeStatus === "past_due") {
    plan = "team";
    status = "past_due";
  } else if (stripeStatus === "incomplete" || stripeStatus === "paused") {
    // Checkout often lands here briefly before `active`; persist Stripe ids so the app + webhooks can converge.
    plan = "team";
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

  await prisma.teamSubscription.update({
    where: { teamId },
    data: {
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      stripeSubscriptionId: subId,
      plan,
      status,
      currentPeriodEnd,
    },
  });
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
    return { applied: false, message: "Stripe is not configured on this server." };
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
      return { applied: true, message: "Subscription refreshed from Stripe." };
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
      return { applied: true, message: "Subscription found for this team’s Stripe customer and saved." };
    }
    return {
      applied: false,
      message:
        "This workspace has a Stripe customer id but no matching subscription. Open Stripe → Subscriptions and confirm status, or add metadata team_id on the subscription to this team’s id.",
    };
  }

  const owner = await prisma.teamMember.findFirst({
    where: { teamId, role: "owner" },
    include: { user: { select: { email: true } } },
  });
  const email = owner?.user?.email?.trim();
  const ownerUserId = owner?.userId ?? null;
  if (!email || !ownerUserId) {
    return { applied: false, message: "No team owner email found to look up Stripe customers." };
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

  /** Stripe customer email can differ from the team owner email in Neon; metadata team_id is authoritative. */
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
          "Subscription matched in Stripe by metadata team_id (owner email did not have to match the Stripe customer email).",
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
        "Linked your only active Stripe subscription on this billing email to this workspace (no team_id metadata was required).",
    };
  }

  return {
    applied: false,
    message:
      ownedTeams.length > 1 && candidates.length > 0
        ? "Stripe has one or more subscriptions on your email, but this account owns multiple workspaces. In Stripe → Subscription → Metadata, set team_id to this workspace’s id, then sync again."
        : candidates.length === 0
          ? "No active Stripe subscriptions found for the team owner’s email in this Stripe account. Confirm you are in the correct Stripe mode (test vs live) and the subscription uses the same email."
          : "Could not safely match a subscription to this workspace. In Stripe Dashboard, open the subscription → Metadata → add team_id with this workspace’s id, then reload Plan.",
  };
}

const subscriptionReadReconcileCooldownMs = 60_000;
const lastSubscriptionReadReconcileAt = new Map<string, number>();

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
