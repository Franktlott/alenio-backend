import type { Context } from "hono";
import Stripe from "stripe";
import { env } from "../env";
import {
  applySubscriptionFromStripeSubscription,
  getStripeClient,
  stripeCustomerIdOfSubscription,
} from "../lib/stripe-billing";

export async function handleStripeWebhook(c: Context): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = getStripeClient();
  if (!secret || !stripe) {
    console.error("[stripe/webhook] Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return c.json({ error: "Billing not configured" }, 503);
  }

  const sig = c.req.header("stripe-signature");
  if (!sig) {
    return c.json({ error: "Missing stripe-signature" }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const teamId =
          session.metadata?.team_id?.trim() ||
          (typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "") ||
          "";
        const subRef = session.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (!teamId || !subId) {
          console.error("[stripe/webhook] checkout.session.completed missing team_id or subscription", {
            teamId,
            subId,
            hasMetadata: !!session.metadata?.team_id,
            clientReferenceId: session.client_reference_id ?? null,
          });
          break;
        }
        const customerRaw = session.customer;
        const customerIdFromSession =
          typeof customerRaw === "string" ? customerRaw : customerRaw && "id" in customerRaw
            ? (customerRaw as { id: string }).id
            : null;
        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data"],
        });
        const customerId = customerIdFromSession ?? stripeCustomerIdOfSubscription(subscription);
        await applySubscriptionFromStripeSubscription(teamId, customerId, subscription);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const teamId = subscription.metadata?.team_id?.trim();
        if (!teamId) {
          console.warn("[stripe/webhook] subscription event missing metadata.team_id", subscription.id);
          break;
        }
        const customerId = stripeCustomerIdOfSubscription(subscription);
        await applySubscriptionFromStripeSubscription(teamId, customerId, subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", event.type, err);
    return c.json({ error: "Webhook handler failed" }, 500);
  }

  return c.json({ received: true });
}
