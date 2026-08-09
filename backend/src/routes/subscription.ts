import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { createTeamCheckoutSession, createTeamPortalSession } from "../lib/team-billing-sessions";
import type { TeamSubscription } from "@prisma/client";
import { getWorkspaceAccess, resolveWorkspaceAccess } from "../lib/workspace-access";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const subscriptionRouter = new Hono<{ Variables: Variables }>();
subscriptionRouter.use("*", authGuard);

const WEB_BILLING_MESSAGE =
  "Subscribe and manage your team plan at https://alenio.com/billing (Stripe on the web).";

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

/** Read a subscription without creating a free row. Missing rows are legacy grandfathered workspaces. */
export async function getTeamSubscription(teamId: string): Promise<TeamSubscription> {
  const sub = await prisma.teamSubscription.findUnique({ where: { teamId } });
  if (!sub) {
    return {
      id: `legacy:${teamId}`,
      teamId,
      plan: "free",
      status: "active",
      trialStartedAt: null,
      trialEndsAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }
  if (sub.plan === "pro") {
    return prisma.teamSubscription.update({
      where: { teamId },
      data: { plan: "team" },
    });
  }
  return sub;
}

/** Pro + Operations unlock tasks, activity, workspace (Operations also unlocks Go). */
export function teamSubscriptionRowHasTeamFeatures(
  sub: ({ teamId?: string; plan: string; status: string; trialStartedAt?: Date | null; trialEndsAt?: Date | null }) | null | undefined,
): boolean {
  return resolveWorkspaceAccess(sub?.teamId ?? "unknown", sub ? {
    teamId: sub.teamId ?? "unknown",
    plan: sub.plan,
    status: sub.status,
    trialStartedAt: sub.trialStartedAt ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
  } : null).hasTeamFeatures;
}

/** Alenio Go — Operations plan only. */
export function teamSubscriptionRowHasGoFeatures(
  sub: ({ teamId?: string; plan: string; status: string; trialStartedAt?: Date | null; trialEndsAt?: Date | null }) | null | undefined,
): boolean {
  return resolveWorkspaceAccess(sub?.teamId ?? "unknown", sub ? {
    teamId: sub.teamId ?? "unknown",
    plan: sub.plan,
    status: sub.status,
    trialStartedAt: sub.trialStartedAt ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
  } : null).hasGoFeatures;
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

  const { reconcileStripeForSubscriptionRead, syncSubscriptionDetailsFromStripe } = await import(
    "../lib/stripe-billing"
  );
  try {
    await reconcileStripeForSubscriptionRead(teamId);
  } catch (err) {
    console.warn("[subscription] Stripe reconcile skipped:", err);
  }

  let subscription = await getTeamSubscription(teamId);
  const stripeDetails = await syncSubscriptionDetailsFromStripe(teamId);
  subscription = await getTeamSubscription(teamId);
  const billingProvider = billingProviderFromSubscription(subscription);
  const access = await getWorkspaceAccess(teamId);
  return c.json({
    data: {
      plan: subscription.plan,
      status: access.status,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      remainingDays: access.remainingDays,
      canWrite: access.canWrite,
      accessMode: access.accessMode,
      bannerSeverity: access.bannerSeverity,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: stripeDetails.cancelAtPeriodEnd,
      billingInterval: stripeDetails.billingInterval,
      billingProvider,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      hasStripeCustomer: !!subscription.stripeCustomerId?.trim(),
      hasStripeSubscription: !!subscription.stripeSubscriptionId?.trim(),
      hasTeamFeatures: access.hasTeamFeatures,
      hasGoFeatures: access.hasGoFeatures,
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
        trialStartedAt: current.trialStartedAt,
        trialEndsAt: current.trialEndsAt,
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
