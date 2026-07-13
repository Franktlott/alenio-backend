import type { Hono } from "hono";
import { prisma } from "../prisma";
import { getSessionFromHeaders } from "../auth";
import { getTeamSubscription, billingProviderFromSubscription } from "./subscription";
import {
  getStripeClient,
  isStripeCheckoutConfigured,
  isStripeCheckoutPlanConfigured,
  reconcileStripeForSubscriptionRead,
  reconcileTeamStripeSubscription,
  type StripeCheckoutPlan,
} from "../lib/stripe-billing";
import { env } from "../env";
import { webPrismaUserIdFromContext } from "../lib/web-prisma-user";
import { createTeamCheckoutSession, createTeamPortalSession } from "../lib/team-billing-sessions";
import { billingReturnBaseUrl } from "../lib/stripe-billing";

async function getWebSession(c: { req: { raw: Request } }) {
  return getSessionFromHeaders(c.req.raw.headers);
}

/**
 * TeamMember.userId may equal the Neon JWT `sub` from older flows, while `webPrismaUserIdFromContext`
 * returns the Prisma `User.id` after email-based sync — try both so billing routes resolve membership.
 */
async function membershipForWebBilling(
  c: { get: (key: "user") => unknown; req: { raw: Request } },
  teamId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSessionFromHeaders>>>,
) {
  const syncedId = webPrismaUserIdFromContext(c);
  const jwtId = session.user.id?.trim() || "";
  const ids = [...new Set([syncedId, jwtId].filter((x): x is string => !!x && x.length > 0))];
  for (const userId of ids) {
    const m = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (m) return m;
  }
  return null;
}

function parseCheckoutPlan(raw: unknown): StripeCheckoutPlan {
  return raw === "operations" ? "operations" : "pro";
}

export function mountWebStripeBilling(webRouter: Hono): void {
  webRouter.get("/api/teams/:id/subscription", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const teamId = c.req.param("id");
    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) return c.json({ error: "Not found" }, 404);
    await reconcileStripeForSubscriptionRead(teamId);
    const subscription = await getTeamSubscription(teamId);
    const billingProvider = billingProviderFromSubscription(subscription);
    return c.json({ data: { ...subscription, billingProvider } });
  });

  /** Lets the web app show setup guidance when checkout returns NOT_CONFIGURED (common in local dev). */
  webRouter.get("/api/billing/checkout-config", async (c) => {
    if (!(await getWebSession(c))) return c.json({ error: "Unauthorized" }, 401);
    const configured = isStripeCheckoutConfigured();
    const missing: string[] = [];
    if (!getStripeClient()) missing.push("STRIPE_SECRET_KEY");
    if (!env.STRIPE_TEAM_PRICE_ID?.trim() && !env.STRIPE_OPERATIONS_PRICE_ID?.trim()) {
      missing.push("STRIPE_TEAM_PRICE_ID or STRIPE_OPERATIONS_PRICE_ID");
    }
    if (!billingReturnBaseUrl()) missing.push("WEB_PUBLIC_URL");
    return c.json({
      data: {
        configured,
        missingKeys: missing,
        plans: {
          pro: isStripeCheckoutPlanConfigured("pro"),
          operations: isStripeCheckoutPlanConfigured("operations"),
        },
      },
    });
  });

  webRouter.post("/api/billing/checkout-session", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { teamId?: string; plan?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const plan = parseCheckoutPlan(body.plan);

    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can subscribe", code: "FORBIDDEN" } }, 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { email: true },
    });

    const result = await createTeamCheckoutSession({
      teamId,
      userId: membership.userId,
      userEmail: user?.email,
      plan,
    });

    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    if ("upgraded" in result) {
      const subscription = await getTeamSubscription(teamId);
      const billingProvider = billingProviderFromSubscription(subscription);
      return c.json({ data: { upgraded: true as const, subscription: { ...subscription, billingProvider } } });
    }
    return c.json({ data: { url: result.url } });
  });

  webRouter.post("/api/billing/portal-session", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { teamId?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }

    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can open the billing portal", code: "FORBIDDEN" } }, 403);
    }

    const result = await createTeamPortalSession({ teamId, userId: membership.userId });
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ data: { url: result.url } });
  });

  /** Owner: pull subscription state from billing into Postgres (missed webhooks, legacy checkouts). */
  webRouter.post("/api/billing/reconcile-subscription", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!getStripeClient()) {
      return c.json({ error: { message: "Billing is not configured", code: "NOT_CONFIGURED" } }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as { teamId?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member of this workspace", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can sync billing", code: "FORBIDDEN" } }, 403);
    }
    const reconcile = await reconcileTeamStripeSubscription(teamId);
    const fresh = await getTeamSubscription(teamId);
    const billingProvider = billingProviderFromSubscription(fresh);
    return c.json({ data: { subscription: { ...fresh, billingProvider }, reconcile } });
  });
}
