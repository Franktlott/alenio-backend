import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const subscriptionRouter = new Hono<{ Variables: Variables }>();
subscriptionRouter.use("*", authGuard);

// Helper: fetch or create a free subscription for a team
export async function getTeamSubscription(teamId: string) {
  return prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan: "free",
      status: "active",
    },
    update: {},
  });
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
  return c.json({ data: subscription });
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

  const currentPeriodEnd = new Date();
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

  const subscription = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan,
      status: "active",
      currentPeriodEnd,
    },
    update: {
      plan,
      status: "active",
      currentPeriodEnd,
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
