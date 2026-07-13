import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  billingProviderFromSubscription,
  getTeamSubscription,
} from "./subscription";
import { createTeamCheckoutSession, createTeamPortalSession } from "../lib/team-billing-sessions";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const mobileBillingRouter = new Hono<{ Variables: Variables }>();
mobileBillingRouter.use("*", authGuard);

function subscriptionSummary(sub: Awaited<ReturnType<typeof getTeamSubscription>>) {
  const billingProvider = billingProviderFromSubscription(sub);
  return {
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    billingProvider,
    hasStripeCustomer: !!sub.stripeCustomerId?.trim(),
    hasStripeSubscription: !!sub.stripeSubscriptionId?.trim(),
  };
}

/** GET /api/billing/workspaces — all workspaces with plan summary for account hub */
mobileBillingRouter.get("/workspaces", async (c) => {
  const user = c.get("user")!;
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const rows = await Promise.all(
    memberships.map(async (m) => {
      const sub = await getTeamSubscription(m.teamId);
      return {
        id: m.team.id,
        name: m.team.name,
        image: m.team.image,
        role: m.role,
        canManageBilling: m.role === "owner",
        subscription: subscriptionSummary(sub),
      };
    }),
  );

  return c.json({ data: { workspaces: rows } });
});

/** POST /api/billing/checkout-session — owner: Stripe Checkout for Pro or Operations */
mobileBillingRouter.post("/checkout-session", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as { teamId?: string; plan?: string };
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) {
    return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
  }
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

/** POST /api/billing/portal-session — owner: update payment method / invoices */
mobileBillingRouter.post("/portal-session", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as { teamId?: string };
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) {
    return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const result = await createTeamPortalSession({ teamId, userId: user.id });
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ data: { url: result.url } });
});

export { mobileBillingRouter };
