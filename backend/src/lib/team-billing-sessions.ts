import { prisma } from "../prisma";
import { getTeamSubscription } from "../routes/subscription";
import {
  applySubscriptionFromStripeSubscription,
  billingReturnBaseUrl,
  dbPlanForCheckoutPlan,
  ensureStripeCustomerIdForTeam,
  getStripeClient,
  isStripeCheckoutPlanConfigured,
  isStripePortalConfigured,
  stripeCustomerIdOfSubscription,
  stripePriceIdForCheckoutPlan,
  type StripeCheckoutPlan,
} from "./stripe-billing";

type BillingError = { message: string; code: string };
export type BillingCheckoutResult =
  | { url: string }
  | { upgraded: true }
  | { error: BillingError; status: number };
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

function isPaidPlan(plan: string): boolean {
  return plan === "team" || plan === "pro" || plan === "operations";
}

function normalizeDbPlan(plan: string): "free" | "team" | "operations" {
  const p = plan.trim().toLowerCase();
  if (p === "operations") return "operations";
  if (p === "team" || p === "pro") return "team";
  return "free";
}

async function upgradeExistingStripeSubscription(opts: {
  teamId: string;
  stripeSubscriptionId: string;
  priceId: string;
  dbPlan: "team" | "operations";
}): Promise<BillingCheckoutResult> {
  const stripe = getStripeClient()!;
  const subscription = await stripe.subscriptions.retrieve(opts.stripeSubscriptionId, {
    expand: ["items.data"],
  });
  const item = subscription.items.data[0];
  if (!item?.id) {
    return {
      error: { message: "Could not find the current subscription item to upgrade.", code: "STRIPE_ERROR" },
      status: 502,
    };
  }

  const updated = await stripe.subscriptions.update(opts.stripeSubscriptionId, {
    items: [{ id: item.id, price: opts.priceId }],
    proration_behavior: "create_prorations",
    metadata: {
      ...subscription.metadata,
      team_id: opts.teamId,
      plan: opts.dbPlan,
    },
  });

  const customerId = stripeCustomerIdOfSubscription(updated);
  await applySubscriptionFromStripeSubscription(opts.teamId, customerId, updated);
  return { upgraded: true };
}

export async function createTeamCheckoutSession(opts: {
  teamId: string;
  userId: string;
  userEmail?: string | null;
  /** Defaults to Pro (`team` in DB). */
  plan?: StripeCheckoutPlan;
}): Promise<BillingCheckoutResult> {
  const checkoutPlan: StripeCheckoutPlan = opts.plan === "operations" ? "operations" : "pro";
  if (!isStripeCheckoutPlanConfigured(checkoutPlan)) {
    return {
      error: {
        message:
          checkoutPlan === "operations"
            ? "Operations checkout is not available right now. Try again later or contact support."
            : "Checkout is not available right now. Try again later or use the web dashboard.",
        code: "NOT_CONFIGURED",
      },
      status: 503,
    };
  }

  const ownerErr = await assertOwnerMembership(opts.userId, opts.teamId);
  if (ownerErr) return { error: ownerErr, status: ownerErr.code === "FORBIDDEN" ? 403 : 400 };

  const subRow = await getTeamSubscription(opts.teamId);
  const targetDbPlan = dbPlanForCheckoutPlan(checkoutPlan);
  const currentDbPlan = normalizeDbPlan(subRow.plan);
  const priceId = stripePriceIdForCheckoutPlan(checkoutPlan)!;
  const activeStripe =
    !!subRow.stripeSubscriptionId?.trim() &&
    ["active", "trialing", "past_due", "incomplete", "paused"].includes(subRow.status);

  if (activeStripe) {
    if (currentDbPlan === targetDbPlan) {
      return {
        error: {
          message: "This workplace already has this plan. Use Manage billing to update payment.",
          code: "ALREADY_SUBSCRIBED",
        },
        status: 409,
      };
    }
    return upgradeExistingStripeSubscription({
      teamId: opts.teamId,
      stripeSubscriptionId: subRow.stripeSubscriptionId!.trim(),
      priceId,
      dbPlan: targetDbPlan,
    });
  }

  if (isPaidPlan(subRow.plan) && subRow.status === "active" && !subRow.stripeSubscriptionId) {
    return {
      error: {
        message: "This workplace subscription is managed elsewhere. Contact support if you need help.",
        code: "EXTERNALLY_MANAGED",
      },
      status: 409,
    };
  }

  const stripe = getStripeClient()!;
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
      plan: targetDbPlan,
    },
    subscription_data: {
      metadata: {
        team_id: opts.teamId,
        user_id: opts.userId,
        plan: targetDbPlan,
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
        message: "No billing profile for this workplace yet. Upgrade to Pro first.",
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
