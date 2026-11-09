import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import {
  PLAN_BEST_FOR_MAX,
  PLAN_FEATURE_MAX,
  PLAN_FEATURES_MAX,
  PLAN_NAME_MAX,
  PLAN_PRICE_MAX_CENTS,
  PLAN_PRICE_MIN_CENTS,
  getBillingPlans,
  isBillingPlanKey,
  serializePublicPlan,
  subscriberCounts,
  updateBillingPlan,
} from "../lib/billing-plans";
import { isGooglePlayReportingConfigured } from "../lib/google-play-api";
import { PLAN_FEATURES } from "../lib/plan-features";
import { getStripeClient } from "../lib/stripe-billing";
import { recordStaffAction } from "../lib/staff-audit";
import { adminGuard, requireAbility, resolveStaffActor } from "../middleware/admin-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

/** Signed-out pricing page, the apps and the billing screens all read plans from here. */
export const publicPlansRouter = new Hono();

publicPlansRouter.get("/", async (c) => {
  const plans = await getBillingPlans();
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ data: plans.map((plan) => serializePublicPlan(plan, plans)) });
});

const planBody = z.object({
  name: z.string().trim().min(1).max(PLAN_NAME_MAX),
  bestFor: z.string().trim().max(PLAN_BEST_FOR_MAX),
  features: z.array(z.string().max(PLAN_FEATURE_MAX * 2)).max(PLAN_FEATURES_MAX * 2),
  includedFeatures: z.array(z.string().max(60)).max(PLAN_FEATURES.length * 2),
  priceCents: z.number().int().min(PLAN_PRICE_MIN_CENTS).max(PLAN_PRICE_MAX_CENTS),
  existingSubscribers: z.enum(["keep", "move"]).nullable().optional(),
});

export const adminPricingRouter = new Hono<{ Variables: Variables }>();

adminPricingRouter.use("*", adminGuard);
adminPricingRouter.use("*", requireAbility("pricing.manage"));

adminPricingRouter.get("/", async (c) => {
  const [plans, counts, changes, playStatuses] = await Promise.all([
    getBillingPlans(),
    subscriberCounts(),
    prisma.billingPlanChange.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.playExternalReport.groupBy({ by: ["status"], _count: { _all: true } }).catch(() => []),
  ]);
  const playCount = (status: string) => playStatuses.find((row) => row.status === status)?._count._all ?? 0;
  const actors = await prisma.user.findMany({
    where: { id: { in: [...new Set(changes.map((change) => change.actorId))] } },
    select: { id: true, name: true, email: true },
  });
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name?.trim() || actor.email]));
  return c.json({
    data: {
      billingConnected: Boolean(getStripeClient()),
      catalog: PLAN_FEATURES,
      googlePlay: {
        connected: isGooglePlayReportingConfigured(),
        reported: playCount("reported"),
        waiting: playCount("pending"),
        failed: playCount("failed"),
      },
      plans: plans.map((plan) => ({
        ...serializePublicPlan(plan, plans),
        subscribers: isBillingPlanKey(plan.key) ? counts[plan.key] : 0,
        hasStripePrice: Boolean(plan.stripePriceId),
        updatedAt: plan.updatedAt,
      })),
      history: changes.map((change) => ({
        id: change.id,
        planKey: change.planKey,
        summary: change.summary,
        existingSubscribers: change.existingSubscribers,
        moveStatus: change.moveStatus,
        movedCount: change.movedCount,
        moveFailedCount: change.moveFailedCount,
        createdAt: change.createdAt,
        actorName: actorName.get(change.actorId) ?? "Someone",
      })),
    },
  });
});

adminPricingRouter.patch("/:key", async (c) => {
  const key = c.req.param("key");
  if (!isBillingPlanKey(key)) return c.json({ error: { message: "Plan not found.", code: "NOT_FOUND" } }, 404);
  const parsed = planBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: { message: first?.message ?? "Check the form and try again.", code: "INVALID", field: first?.path.join(".") } }, 400);
  }
  const actor = await resolveStaffActor(c);
  if (!actor) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);

  const before = (await getBillingPlans()).find((plan) => plan.key === key);
  const result = await updateBillingPlan(
    key,
    { ...parsed.data, existingSubscribers: parsed.data.existingSubscribers ?? null },
    actor.id,
    getStripeClient(),
  );
  if (!result.ok) return c.json({ error: { message: result.message, code: result.code } }, result.status);

  if (result.changeId) {
    const change = await prisma.billingPlanChange.findUnique({ where: { id: result.changeId } });
    void recordStaffAction({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "pricing.update",
      targetType: "pricing",
      targetId: key,
      summary: `${before?.name ?? key}: ${change?.summary ?? "updated"}`,
    });
  }
  return c.json({ data: serializePublicPlan(result.plan) });
});
