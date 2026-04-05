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

  const currentPeriodEnd = new Date();
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

  const subscription = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan: "pro",
      status: "active",
      currentPeriodEnd,
    },
    update: {
      plan: "pro",
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
