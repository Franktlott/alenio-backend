import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { createTeamCheckoutSession, createTeamPortalSession } from "../lib/team-billing-sessions";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const subscriptionRouter = new Hono<{ Variables: Variables }>();
subscriptionRouter.use("*", authGuard);

const WEB_BILLING_MESSAGE =
  "Subscribe and manage your team plan at https://alenio.com/billing (Stripe on the web).";

// Helper: fetch or create a free subscription for a team
export function billingProviderFromSubscription(sub: {
  stripeSubscriptionId: string | null;
  plan: string;
  status: string;
}): "stripe" | "mobile_store" | "none" {
  if (sub.stripeSubscriptionId?.trim()) return "stripe";
  if (
    (sub.plan === "team" || sub.plan === "pro" || sub.plan === "operations") &&
    sub.status === "active" &&
    !sub.stripeSubscriptionId?.trim()
  ) {
    return "mobile_store";
  }
  return "none";
}

export async function getTeamSubscription(teamId: string) {
  const sub = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: { teamId, plan: "free", status: "active" },
    update: {},
  });
  if (sub.plan === "pro") {
    return prisma.teamSubscription.update({
      where: { teamId },
      data: { plan: "team" },
    });
  }
  return sub;
}

const PAID_ACTIVE_STATUSES = ["active", "trialing", "past_due", "incomplete", "paused"] as const;

/** Pro + Operations unlock tasks, activity, workspace (Operations also unlocks Go). */
export function teamSubscriptionRowHasTeamFeatures(sub: { plan: string; status: string } | null | undefined): boolean {
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  const status = (sub?.status ?? "active").trim().toLowerCase();
  if (!["team", "pro", "operations"].includes(plan)) return false;
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Alenio Go — Operations plan only. */
export function teamSubscriptionRowHasGoFeatures(sub: { plan: string; status: string } | null | undefined): boolean {
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  const status = (sub?.status ?? "active").trim().toLowerCase();
  if (plan !== "operations") return false;
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

// GET /api/teams/:teamId/subscription
subscriptionRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const { reconcileStripeForSubscriptionRead, syncCancelAtPeriodEndFromStripe } = await import(
    "../lib/stripe-billing"
  );
  try {
    await reconcileStripeForSubscriptionRead(teamId);
  } catch (err) {
    console.warn("[subscription] Stripe reconcile skipped:", err);
  }

  let subscription = await getTeamSubscription(teamId);
  const cancelAtPeriodEnd = await syncCancelAtPeriodEndFromStripe(teamId);
  subscription = await getTeamSubscription(teamId);
  const billingProvider = billingProviderFromSubscription(subscription);
  return c.json({
    data: {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd,
      billingProvider,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    },
  });
});

export const PLAN_PRICING: Record<string, { price: number; memberLimit: number }> = {
  free: { price: 0, memberLimit: 10 },
  /** Display/API alias — Stripe checkout still uses the Team price ID until remapped. */
  team: { price: 39.99, memberLimit: 25 },
  pro: { price: 39.99, memberLimit: 25 },
  operations: { price: 69.99, memberLimit: 50 },
};

// GET /api/teams/:teamId/subscription/health — owner-only Stripe/DB diagnostic
subscriptionRouter.get("/health", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }
  if (membership.role !== "owner") {
    return c.json({ error: { message: "Only the team owner can access subscription health", code: "FORBIDDEN" } }, 403);
  }

  const current = await getTeamSubscription(teamId);
  const billingProvider = billingProviderFromSubscription(current);

  return c.json({
    data: {
      billingProvider,
      teamSubscription: {
        plan: current.plan,
        status: current.status,
        currentPeriodEnd: current.currentPeriodEnd,
        stripeSubscriptionId: current.stripeSubscriptionId,
        stripeCustomerId: current.stripeCustomerId,
      },
    },
  });
});

// POST /api/teams/:teamId/subscription/checkout-session — Stripe Checkout (mobile + web)
subscriptionRouter.post("/checkout-session", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const body = (await c.req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan === "operations" ? "operations" : "pro";
  const result = await createTeamCheckoutSession({
    teamId,
    userId: user.id,
    userEmail: user.email,
    plan,
  });
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  if ("upgraded" in result) {
    return c.json({ data: { upgraded: true as const } });
  }
  return c.json({ data: { url: result.url } });
});

// POST /api/teams/:teamId/subscription/portal-session — Stripe billing portal
subscriptionRouter.post("/portal-session", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const result = await createTeamPortalSession({ teamId, userId: user.id });
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ data: { url: result.url } });
});

// POST /api/teams/:teamId/subscription/upgrade — web billing only
subscriptionRouter.post("/upgrade", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }
  if (membership.role !== "owner") {
    return c.json({ error: { message: "Only the team owner can manage the subscription", code: "FORBIDDEN" } }, 403);
  }

  return c.json(
    {
      error: {
        message: WEB_BILLING_MESSAGE,
        code: "WEB_BILLING_REQUIRED",
      },
    },
    403,
  );
});

// POST /api/teams/:teamId/subscription/cancel — web billing only
subscriptionRouter.post("/cancel", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }
  if (membership.role !== "owner") {
    return c.json({ error: { message: "Only the team owner can manage the subscription", code: "FORBIDDEN" } }, 403);
  }

  return c.json(
    {
      error: {
        message: WEB_BILLING_MESSAGE,
        code: "WEB_BILLING_REQUIRED",
      },
    },
    403,
  );
});

export { subscriptionRouter };
