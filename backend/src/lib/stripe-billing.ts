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
  if (stripeStatus === "incomplete" || stripeStatus === "paused") {
    return;
  }

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
