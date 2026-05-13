import type { Hono } from "hono";
import { prisma } from "../prisma";
import { getSessionFromHeaders } from "../auth";
import { getTeamSubscription, billingProviderFromSubscription } from "./subscription";
import {
  billingReturnBaseUrl,
  getStripeClient,
  isStripeCheckoutConfigured,
  isStripePortalConfigured,
} from "../lib/stripe-billing";
import { env } from "../env";
import { webPrismaUserIdFromContext } from "../lib/web-prisma-user";

async function getWebSession(c: { req: { raw: Request } }) {
  return getSessionFromHeaders(c.req.raw.headers);
}

export function mountWebStripeBilling(webRouter: Hono): void {
  webRouter.get("/api/teams/:id/subscription", async (c) => {
    if (!(await getWebSession(c))) return c.json({ error: "Unauthorized" }, 401);
    const userId = webPrismaUserIdFromContext(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const teamId = c.req.param("id");
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) return c.json({ error: "Not found" }, 404);
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
    if (!env.STRIPE_TEAM_PRICE_ID?.trim()) missing.push("STRIPE_TEAM_PRICE_ID");
    if (!billingReturnBaseUrl()) missing.push("WEB_PUBLIC_URL");
    return c.json({ data: { configured, missingKeys: missing } });
  });

  webRouter.post("/api/billing/checkout-session", async (c) => {
    if (!(await getWebSession(c))) return c.json({ error: "Unauthorized" }, 401);
    const userId = webPrismaUserIdFromContext(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    if (!isStripeCheckoutConfigured()) {
      return c.json(
        {
          error: {
            message:
              "Stripe checkout is not configured (need STRIPE_SECRET_KEY, STRIPE_TEAM_PRICE_ID, WEB_PUBLIC_URL)",
            code: "NOT_CONFIGURED",
          },
        },
        503,
      );
    }
    const stripe = getStripeClient()!;
    const priceId = env.STRIPE_TEAM_PRICE_ID!.trim();
    const base = billingReturnBaseUrl()!;

    const body = await c.req.json().catch(() => ({})) as { teamId?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can subscribe", code: "FORBIDDEN" } }, 403);
    }

    const subRow = await getTeamSubscription(teamId);

    if (subRow.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(subRow.status)) {
      return c.json(
        {
          error: {
            message: "This team already has an active Stripe subscription. Use Manage billing.",
            code: "ALREADY_SUBSCRIBED",
          },
        },
        409,
      );
    }

    if (
      (subRow.plan === "team" || subRow.plan === "pro") &&
      subRow.status === "active" &&
      !subRow.stripeSubscriptionId
    ) {
      return c.json(
        {
          error: {
            message:
              "This team’s subscription is managed in the mobile app (App Store). Web checkout is only for teams billed through Stripe.",
            code: "MOBILE_MANAGED",
          },
        },
        409,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing?billing=cancel`,
      client_reference_id: teamId,
      customer_email: user?.email?.trim() || undefined,
      metadata: {
        team_id: teamId,
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          team_id: teamId,
          user_id: userId,
        },
      },
    });

    if (!checkout.url) {
      return c.json({ error: { message: "Checkout did not return a URL", code: "STRIPE_ERROR" } }, 502);
    }

    return c.json({ data: { url: checkout.url } });
  });

  webRouter.post("/api/billing/portal-session", async (c) => {
    if (!(await getWebSession(c))) return c.json({ error: "Unauthorized" }, 401);
    const userId = webPrismaUserIdFromContext(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    if (!isStripePortalConfigured()) {
      return c.json(
        {
          error: {
            message: "Stripe portal is not configured (need STRIPE_SECRET_KEY and WEB_PUBLIC_URL)",
            code: "NOT_CONFIGURED",
          },
        },
        503,
      );
    }
    const stripe = getStripeClient()!;
    const base = billingReturnBaseUrl()!;

    const body = await c.req.json().catch(() => ({})) as { teamId?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can open the billing portal", code: "FORBIDDEN" } }, 403);
    }

    const subRow = await getTeamSubscription(teamId);
    if (!subRow.stripeCustomerId?.trim()) {
      return c.json(
        { error: { message: "No Stripe customer for this team yet. Subscribe on the web first.", code: "NO_CUSTOMER" } },
        400,
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subRow.stripeCustomerId.trim(),
      return_url: `${base}/billing`,
    });

    if (!portal.url) {
      return c.json({ error: { message: "Portal did not return a URL", code: "STRIPE_ERROR" } }, 502);
    }

    return c.json({ data: { url: portal.url } });
  });
}
