import type { Hono } from "hono";
import { prisma } from "../prisma";
import { getSessionFromHeaders } from "../auth";
import { getTeamSubscription, billingProviderFromSubscription } from "./subscription";
import {
  billingReturnBaseUrl,
  ensureStripeCustomerIdForTeam,
  getStripeClient,
  isStripeCheckoutConfigured,
  isStripePortalConfigured,
  reconcileTeamStripeSubscription,
} from "../lib/stripe-billing";
import { env } from "../env";
import { webPrismaUserIdFromContext } from "../lib/web-prisma-user";

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

export function mountWebStripeBilling(webRouter: Hono): void {
  webRouter.get("/api/teams/:id/subscription", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const teamId = c.req.param("id");
    const membership = await membershipForWebBilling(c, teamId, session);
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
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
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

    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can subscribe", code: "FORBIDDEN" } }, 403);
    }

    const subRow = await getTeamSubscription(teamId);

    if (
      subRow.stripeSubscriptionId &&
      ["active", "trialing", "past_due", "incomplete", "paused"].includes(subRow.status)
    ) {
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

    const stripeUserMeta = webPrismaUserIdFromContext(c) ?? membership.userId;
    const user = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { email: true },
    });

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing?billing=cancel`,
      client_reference_id: teamId,
      customer_email: user?.email?.trim() || undefined,
      metadata: {
        team_id: teamId,
        user_id: stripeUserMeta,
      },
      subscription_data: {
        metadata: {
          team_id: teamId,
          user_id: stripeUserMeta,
        },
      },
    });

    if (!checkout.url) {
      return c.json({ error: { message: "Checkout did not return a URL", code: "STRIPE_ERROR" } }, 502);
    }

    return c.json({ data: { url: checkout.url } });
  });

  webRouter.post("/api/billing/portal-session", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
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

    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can open the billing portal", code: "FORBIDDEN" } }, 403);
    }

    const subRow = await getTeamSubscription(teamId);
    const customerId =
      subRow.stripeCustomerId?.trim() || (await ensureStripeCustomerIdForTeam(teamId))?.trim() || null;
    if (!customerId) {
      return c.json(
        { error: { message: "No Stripe customer for this team yet. Subscribe on the web first.", code: "NO_CUSTOMER" } },
        400,
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/billing`,
    });

    if (!portal.url) {
      return c.json({ error: { message: "Portal did not return a URL", code: "STRIPE_ERROR" } }, 502);
    }

    return c.json({ data: { url: portal.url } });
  });

  /** Owner: pull subscription state from Stripe into Postgres (missed webhooks, legacy checkouts). */
  webRouter.post("/api/billing/reconcile-subscription", async (c) => {
    const session = await getWebSession(c);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!getStripeClient()) {
      return c.json({ error: { message: "Stripe not configured", code: "NOT_CONFIGURED" } }, 503);
    }
    const body = await c.req.json().catch(() => ({})) as { teamId?: string };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return c.json({ error: { message: "teamId is required", code: "VALIDATION_ERROR" } }, 400);
    }
    const membership = await membershipForWebBilling(c, teamId, session);
    if (!membership) {
      return c.json({ error: { message: "Not a team member of this workspace", code: "FORBIDDEN" } }, 403);
    }
    if (membership.role !== "owner") {
      return c.json({ error: { message: "Only the team owner can sync billing from Stripe", code: "FORBIDDEN" } }, 403);
    }
    const reconcile = await reconcileTeamStripeSubscription(teamId);
    const fresh = await getTeamSubscription(teamId);
    const billingProvider = billingProviderFromSubscription(fresh);
    return c.json({ data: { subscription: { ...fresh, billingProvider }, reconcile } });
  });
}
