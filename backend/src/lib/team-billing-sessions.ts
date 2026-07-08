import { prisma } from "../prisma";
import { getTeamSubscription } from "../routes/subscription";
import {
  billingReturnBaseUrl,
  ensureStripeCustomerIdForTeam,
  getStripeClient,
  isStripeCheckoutConfigured,
  isStripePortalConfigured,
} from "./stripe-billing";
import { env } from "../env";

type BillingError = { message: string; code: string };
type BillingResult = { url: string } | { error: BillingError; status: number };

async function assertOwnerMembership(userId: string, teamId: string): Promise<BillingError | null> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!membership) {
    return { message: "Not a team member", code: "FORBIDDEN" };
  }
  if (membership.role !== "owner") {
    return { message: "Only the workplace owner can manage billing", code: "FORBIDDEN" };
  }
  return null;
}

export async function createTeamCheckoutSession(opts: {
  teamId: string;
  userId: string;
  userEmail?: string | null;
}): Promise<BillingResult> {
  if (!isStripeCheckoutConfigured()) {
    return {
      error: {
        message: "Checkout is not available right now. Try again later or use the web dashboard.",
        code: "NOT_CONFIGURED",
      },
      status: 503,
    };
  }

  const ownerErr = await assertOwnerMembership(opts.userId, opts.teamId);
  if (ownerErr) return { error: ownerErr, status: ownerErr.code === "FORBIDDEN" ? 403 : 400 };

  const subRow = await getTeamSubscription(opts.teamId);
  if (
    subRow.stripeSubscriptionId &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(subRow.status)
  ) {
    return {
      error: {
        message: "This workplace already has an active subscription. Use Update payment instead.",
        code: "ALREADY_SUBSCRIBED",
      },
      status: 409,
    };
  }
  if (
    (subRow.plan === "team" || subRow.plan === "pro") &&
    subRow.status === "active" &&
    !subRow.stripeSubscriptionId
  ) {
    return {
      error: {
        message: "This workplace subscription is managed elsewhere. Contact support if you need help.",
        code: "EXTERNALLY_MANAGED",
      },
      status: 409,
    };
  }

  const stripe = getStripeClient()!;
  const priceId = env.STRIPE_TEAM_PRICE_ID!.trim();
  const base = billingReturnBaseUrl()!;

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing?billing=cancel`,
    client_reference_id: opts.teamId,
    customer_email: opts.userEmail?.trim() || undefined,
    metadata: {
      team_id: opts.teamId,
      user_id: opts.userId,
    },
    subscription_data: {
      metadata: {
        team_id: opts.teamId,
        user_id: opts.userId,
      },
    },
  });

  if (!checkout.url) {
    return { error: { message: "Checkout did not return a URL", code: "STRIPE_ERROR" }, status: 502 };
  }

  return { url: checkout.url };
}

export async function createTeamPortalSession(opts: {
  teamId: string;
  userId: string;
}): Promise<BillingResult> {
  if (!isStripePortalConfigured()) {
    return {
      error: {
        message: "Billing portal is not available right now. Try the web dashboard.",
        code: "NOT_CONFIGURED",
      },
      status: 503,
    };
  }

  const ownerErr = await assertOwnerMembership(opts.userId, opts.teamId);
  if (ownerErr) return { error: ownerErr, status: ownerErr.code === "FORBIDDEN" ? 403 : 400 };

  const subRow = await getTeamSubscription(opts.teamId);
  const customerId =
    subRow.stripeCustomerId?.trim() || (await ensureStripeCustomerIdForTeam(opts.teamId))?.trim() || null;
  if (!customerId) {
    return {
      error: {
        message: "No billing profile for this workplace yet. Upgrade to Team first.",
        code: "NO_CUSTOMER",
      },
      status: 400,
    };
  }

  const stripe = getStripeClient()!;
  const base = billingReturnBaseUrl()!;
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/billing`,
  });

  if (!portal.url) {
    return { error: { message: "Portal did not return a URL", code: "STRIPE_ERROR" }, status: 502 };
  }

  return { url: portal.url };
}
