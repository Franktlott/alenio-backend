import type Stripe from "stripe";
import { prisma } from "../prisma";
import { createPendingWorkspaceCheckoutSession } from "./team-billing-sessions";
import { isTeamDisplayNameTaken, normalizeTeamName } from "./team-name";
import { normalizeWorkspaceLocation } from "./workspace-location";
import { getWorkspaceTrialEligibility } from "./workspace-trial-policy";
import { resolveTimeZone } from "./timezone";
import { stripeCustomerIdOfSubscription } from "./stripe-billing";

// Stripe requires expires_at to remain at least 30 minutes in the future when received.
const CHECKOUT_TTL_MS = 31 * 60 * 1000;

type CheckoutError = {
  ok: false;
  status: 400 | 403 | 409 | 500 | 502 | 503;
  code: string;
  message: string;
};

export type CreatePendingWorkspaceCheckoutResult =
  | {
      ok: true;
      checkoutId: string;
      url: string;
      expiresAt: Date;
    }
  | CheckoutError;

function currentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

export function canFinalizePendingWorkspaceSubscription(status: string): boolean {
  return status === "active";
}

export async function markPendingWorkspaceCheckoutAwaitingPayment(
  checkoutId: string,
  sessionId: string,
  subscriptionId: string,
): Promise<void> {
  await prisma.pendingWorkspaceCheckout.updateMany({
    where: { id: checkoutId, status: "pending", teamId: null },
    data: {
      status: "awaiting_payment",
      stripeCheckoutSessionId: sessionId,
      stripeSubscriptionId: subscriptionId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

export async function createPendingWorkspaceCheckout(opts: {
  userId: string;
  userEmail: string | null | undefined;
  name: string;
  industry?: string | null;
  location?: string | null;
  plan: "pro" | "operations";
}): Promise<CreatePendingWorkspaceCheckoutResult> {
  const name = normalizeTeamName(opts.name);
  if (!name) {
    return { ok: false, status: 400, code: "VALIDATION_ERROR", message: "Name is required" };
  }
  const location = normalizeWorkspaceLocation(opts.location ?? null);
  if (!location.ok) {
    return { ok: false, status: 400, code: "VALIDATION_ERROR", message: location.message };
  }
  const eligibility = await getWorkspaceTrialEligibility(opts.userId, opts.userEmail);
  if (eligibility.canStartWorkspaceTrial) {
    return {
      ok: false,
      status: 409,
      code: "TRIAL_AVAILABLE",
      message: "Your free workspace trial is still available.",
    };
  }
  if (await isTeamDisplayNameTaken(name)) {
    return {
      ok: false,
      status: 409,
      code: "TEAM_NAME_TAKEN",
      message: "A workspace with this name already exists. Pick a different name.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { timezone: true },
  });
  if (!user) {
    return { ok: false, status: 400, code: "USER_NOT_FOUND", message: "Your account could not be found." };
  }

  const nameKey = name.toLocaleLowerCase();
  const now = new Date();
  await prisma.pendingWorkspaceCheckout.updateMany({
    where: { nameKey, status: "pending", expiresAt: { lte: now } },
    data: { status: "expired", nameKey: null },
  });
  const reserved = await prisma.pendingWorkspaceCheckout.findUnique({
    where: { nameKey },
    select: { id: true },
  });
  if (reserved) {
    return {
      ok: false,
      status: 409,
      code: "TEAM_NAME_TAKEN",
      message: "A workspace with this name is currently being created. Pick a different name.",
    };
  }

  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);
  let draft;
  try {
    draft = await prisma.pendingWorkspaceCheckout.create({
      data: {
        userId: opts.userId,
        name,
        nameKey,
        industry: opts.industry?.trim().slice(0, 120) || null,
        location: location.value,
        timezone: resolveTimeZone(user.timezone),
        plan: opts.plan === "operations" ? "operations" : "team",
        expiresAt,
      },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return {
        ok: false,
        status: 409,
        code: "TEAM_NAME_TAKEN",
        message: "A workspace with this name is currently being created. Pick a different name.",
      };
    }
    throw error;
  }

  const session = await createPendingWorkspaceCheckoutSession({
    checkoutId: draft.id,
    userId: opts.userId,
    userEmail: opts.userEmail,
    plan: opts.plan,
    expiresAt,
  });
  if ("error" in session) {
    await prisma.pendingWorkspaceCheckout.delete({ where: { id: draft.id } }).catch(() => undefined);
    return { ok: false, status: session.status, code: session.error.code, message: session.error.message };
  }

  await prisma.pendingWorkspaceCheckout.update({
    where: { id: draft.id },
    data: { stripeCheckoutSessionId: session.stripeCheckoutSessionId },
  });
  return { ok: true, checkoutId: draft.id, url: session.url, expiresAt };
}

export async function finalizePendingWorkspaceCheckout(
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
): Promise<{ teamId: string } | null> {
  const checkoutId =
    session.metadata?.pending_workspace_checkout_id?.trim() ||
    subscription.metadata?.pending_workspace_checkout_id?.trim() ||
    "";
  if (!checkoutId || !canFinalizePendingWorkspaceSubscription(subscription.status)) return null;

  const existing = await prisma.pendingWorkspaceCheckout.findUnique({
    where: { id: checkoutId },
    select: { teamId: true, stripeCheckoutSessionId: true },
  });
  if (!existing) return null;
  if (existing.teamId) return { teamId: existing.teamId };
  if (existing.stripeCheckoutSessionId && existing.stripeCheckoutSessionId !== session.id) {
    throw new Error("Pending workspace checkout session mismatch");
  }

  const customerId = stripeCustomerIdOfSubscription(subscription);
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.pendingWorkspaceCheckout.updateMany({
      where: { id: checkoutId, status: { in: ["pending", "awaiting_payment"] }, teamId: null },
      data: { status: "processing" },
    });
    if (claimed.count !== 1) {
      return tx.pendingWorkspaceCheckout.findUnique({
        where: { id: checkoutId },
        select: { teamId: true },
      });
    }

    const draft = await tx.pendingWorkspaceCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
    let inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    while (await tx.team.findUnique({ where: { inviteCode } })) {
      inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    }
    const team = await tx.team.create({
      data: {
        name: draft.name,
        industry: draft.industry,
        location: draft.location,
        timezone: draft.timezone,
        inviteCode,
      },
    });
    await tx.teamMember.create({
      data: { userId: draft.userId, teamId: team.id, role: "owner" },
    });
    await tx.teamSubscription.create({
      data: {
        teamId: team.id,
        plan: draft.plan,
        status: "active",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: currentPeriodEnd(subscription),
      },
    });
    await tx.pendingWorkspaceCheckout.update({
      where: { id: checkoutId },
      data: {
        status: "completed",
        nameKey: null,
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId: subscription.id,
        teamId: team.id,
        completedAt: new Date(),
      },
    });
    return { teamId: team.id };
  });

  if (!result?.teamId) return null;
  const stripe = (await import("./stripe-billing")).getStripeClient();
  if (stripe) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        pending_workspace_checkout_id: checkoutId,
        team_id: result.teamId,
      },
    });
  }
  return { teamId: result.teamId };
}

export async function expirePendingWorkspaceCheckouts(now = new Date()): Promise<number> {
  const result = await prisma.pendingWorkspaceCheckout.updateMany({
    where: { status: { in: ["pending", "awaiting_payment"] }, expiresAt: { lte: now } },
    data: { status: "expired", nameKey: null },
  });
  return result.count;
}
