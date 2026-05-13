import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { env } from "../env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const subscriptionRouter = new Hono<{ Variables: Variables }>();
subscriptionRouter.use("*", authGuard);

type RevenueCatEntitlementStatus = {
  isActive: boolean;
  currentPeriodEnd: Date | null;
  configured: boolean;
};

async function getRevenueCatEntitlementStatus(appUserId: string): Promise<RevenueCatEntitlementStatus> {
  if (!env.REVENUECAT_SECRET_KEY) {
    return { isActive: false, currentPeriodEnd: null, configured: false };
  }

  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`RevenueCat lookup failed (${response.status})`);
  }

  const json = await response.json().catch(() => null) as
    | {
        subscriber?: {
          entitlements?: Record<string, { expires_date?: string | null }>;
        };
      }
    | null;

  const entitlementId = env.REVENUECAT_TEAM_ENTITLEMENT_ID || "Team";
  const entitlement = json?.subscriber?.entitlements?.[entitlementId];
  if (!entitlement) {
    return { isActive: false, currentPeriodEnd: null, configured: true };
  }

  const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
  const isActive = !expiresAt || expiresAt.getTime() > Date.now();
  return {
    isActive,
    currentPeriodEnd: expiresAt,
    configured: true,
  };
}

export async function syncOwnedTeamSubscriptionsFromRevenueCatUser(appUserId: string) {
  const status = await getRevenueCatEntitlementStatus(appUserId);
  if (!status.configured) return { updatedTeams: 0, configured: false };

  const ownedTeams = await prisma.teamMember.findMany({
    where: { userId: appUserId, role: "owner" },
    select: { teamId: true },
  });

  if (ownedTeams.length === 0) return { updatedTeams: 0, configured: true };

  const teamIds = ownedTeams.map((m) => m.teamId);
  const stripeManaged = await prisma.teamSubscription.findMany({
    where: { teamId: { in: teamIds }, stripeSubscriptionId: { not: null } },
    select: { teamId: true },
  });
  const skipStripeTeams = new Set(stripeManaged.map((s) => s.teamId));

  const nextPlan = status.isActive ? "team" : "free";
  const nextStatus = status.isActive ? "active" : "canceled";

  const toSync = ownedTeams.filter(({ teamId }) => !skipStripeTeams.has(teamId));
  await Promise.all(
    toSync.map(({ teamId }) =>
      prisma.teamSubscription.upsert({
        where: { teamId },
        create: {
          teamId,
          plan: nextPlan,
          status: nextStatus,
          currentPeriodEnd: status.currentPeriodEnd,
        },
        update: {
          plan: nextPlan,
          status: nextStatus,
          currentPeriodEnd: status.currentPeriodEnd,
        },
      })
    )
  );

  return { updatedTeams: toSync.length, configured: true };
}

// GET /api/teams/:teamId/subscription/health
// Owner-only diagnostic endpoint to verify RevenueCat connectivity and entitlement state.
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
  const rc = await getRevenueCatEntitlementStatus(user.id).catch((err) => {
    console.error("[subscription/health] RevenueCat lookup failed:", err);
    return null;
  });

  return c.json({
    data: {
      configured: !!env.REVENUECAT_SECRET_KEY,
      entitlementId: env.REVENUECAT_TEAM_ENTITLEMENT_ID || "Team",
      revenueCatReachable: rc !== null && rc.configured === true,
      entitlementActive: rc?.isActive ?? false,
      entitlementCurrentPeriodEnd: rc?.currentPeriodEnd ?? null,
      teamSubscription: {
        plan: current.plan,
        status: current.status,
        currentPeriodEnd: current.currentPeriodEnd,
      },
    },
  });
});

// Helper: fetch or create a free subscription for a team
export function billingProviderFromSubscription(sub: {
  stripeSubscriptionId: string | null;
  plan: string;
  status: string;
}): "stripe" | "mobile_store" | "none" {
  if (sub.stripeSubscriptionId?.trim()) return "stripe";
  if (
    (sub.plan === "team" || sub.plan === "pro") &&
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
  // Normalize legacy "pro" plan to "team"
  if (sub.plan === "pro") {
    return prisma.teamSubscription.update({
      where: { teamId },
      data: { plan: "team" },
    });
  }
  return sub;
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

  const subscription = await getTeamSubscription(teamId);
  const billingProvider = billingProviderFromSubscription(subscription);
  return c.json({ data: { ...subscription, billingProvider } });
});

// Pricing info
export const PLAN_PRICING: Record<string, { price: number; memberLimit: number }> = {
  free: { price: 0, memberLimit: 10 },
  team: { price: 19, memberLimit: 25 },
};

// POST /api/teams/:teamId/subscription/upgrade
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

  const body = await c.req.json().catch(() => ({}));
  const plan: string = body.plan === "team" ? "team" : body.plan;

  if (!plan || !PLAN_PRICING[plan] || plan === "free") {
    return c.json({ error: { message: "Invalid plan. Must be 'team'", code: "VALIDATION_ERROR" } }, 400);
  }

  const entitlement = await getRevenueCatEntitlementStatus(user.id).catch((err) => {
    console.error("[subscription/upgrade] RevenueCat verify failed:", err);
    return null;
  });
  if (!entitlement?.configured) {
    return c.json({
      error: {
        message: "Subscriptions are not configured on server yet.",
        code: "SUBSCRIPTION_NOT_CONFIGURED",
      },
    }, 503);
  }
  if (!entitlement.isActive) {
    return c.json({
      error: {
        message: "No active Team subscription found for this account.",
        code: "SUBSCRIPTION_INACTIVE",
      },
    }, 402);
  }

  const subscription = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan,
      status: "active",
      currentPeriodEnd: entitlement.currentPeriodEnd,
    },
    update: {
      plan,
      status: "active",
      currentPeriodEnd: entitlement.currentPeriodEnd,
    },
  });

  return c.json({ data: subscription });
});

// POST /api/teams/:teamId/subscription/cancel
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

  const subscription = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan: "free",
      status: "active",
    },
    update: {
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
    },
  });

  return c.json({ data: subscription });
});

export { subscriptionRouter };
