import { Prisma, type BillingPlan } from "@prisma/client";
import type Stripe from "stripe";
import { env } from "../env";
import { prisma } from "../prisma";
import {
  BILLING_PLAN_KEYS,
  DEFAULT_PLAN_FEATURES,
  cleanFeatureKeys,
  displayFeatureLines,
  featureName,
  isBillingPlanKey,
  legacyExtraLines,
  setSavedPlanFeatures,
  type BillingPlanKey,
} from "./plan-features";

export { BILLING_PLAN_KEYS, isBillingPlanKey, type BillingPlanKey };

export const PLAN_NAME_MAX = 40;
export const PLAN_BEST_FOR_MAX = 240;
export const PLAN_FEATURE_MAX = 90;
export const PLAN_FEATURES_MAX = 14;
export const PLAN_PRICE_MIN_CENTS = 100;
export const PLAN_PRICE_MAX_CENTS = 1_000_000;

export type ExistingSubscribers = "keep" | "move";

type PlanDefaults = Pick<
  BillingPlan,
  "name" | "bestFor" | "priceCents" | "currency" | "interval" | "comingSoon"
> & { features: string[] };

const DEFAULTS: Record<BillingPlanKey, PlanDefaults> = {
  pro: {
    name: "Pro",
    bestFor: "Team communication, tasks, development, calendar, chat, and core workspace features.",
    features: [
      "Tasks & action items",
      "Seneca AI coaching assistant",
      "Check-ins with Seneca prep",
      "Development plans & Seneca goal generation",
      "Team calendar",
      "Outlook calendar sync (private, read-only)",
      "Metrics & dashboards",
      "Performance insights",
      "Priority support",
    ],
    priceCents: 3999,
    currency: "usd",
    interval: "month",
    comingSoon: false,
  },
  operations: {
    name: "Operations",
    bestFor: "Everything in Pro plus Alenio Go (checklists, temperature checks, briefings, walks, execution tools).",
    features: [
      "Everything in Pro",
      "Alenio Go — checklists & temperature checks",
      "Shift briefings & walks",
      "Workflow execution tools",
      "Floor-ready ops workflows",
    ],
    priceCents: 6999,
    currency: "usd",
    interval: "month",
    comingSoon: true,
  },
};

/** Subscription rows store Pro as `team`. */
export function dbPlanOfKey(key: BillingPlanKey): "team" | "operations" {
  return key === "operations" ? "operations" : "team";
}

function envPriceId(key: BillingPlanKey): string | null {
  const raw = key === "operations" ? env.STRIPE_OPERATIONS_PRICE_ID : env.STRIPE_TEAM_PRICE_ID;
  return raw?.trim() || null;
}

export function formatPlanPrice(cents: number, currency = "usd"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function planPeriodLabel(interval: string): string {
  return interval === "year" ? "per workspace / year" : "per workspace / month";
}

export function featuresOf(plan: Pick<BillingPlan, "features">): string[] {
  return Array.isArray(plan.features) ? plan.features.filter((item): item is string => typeof item === "string") : [];
}

/** Cleans an edited feature list: trims, drops blanks and repeats, caps length and count. */
export function cleanFeatures(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim().slice(0, PLAN_FEATURE_MAX);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push(line);
    if (out.length >= PLAN_FEATURES_MAX) break;
  }
  return out;
}

export function includedOf(plan: Pick<BillingPlan, "key" | "includedFeatures">): string[] {
  if (Array.isArray(plan.includedFeatures)) return cleanFeatureKeys(plan.includedFeatures);
  return isBillingPlanKey(plan.key) ? DEFAULT_PLAN_FEATURES[plan.key] : cleanFeatureKeys([]);
}

/** One-line description of an edit for the history list and the activity log. */
export function describePlanEdit(
  before: Pick<BillingPlan, "name" | "bestFor" | "priceCents" | "currency" | "comingSoon"> & {
    features: string[];
    included?: string[];
  },
  after: {
    name: string;
    bestFor: string;
    priceCents: number;
    features: string[];
    included?: string[];
    comingSoon: boolean;
  },
  existing: ExistingSubscribers | null,
): string {
  const parts: string[] = [];
  if (before.priceCents !== after.priceCents) {
    const move = existing === "move" ? "existing subscribers move at their next bill" : "existing subscribers keep their price";
    parts.push(`price ${formatPlanPrice(before.priceCents, before.currency)} → ${formatPlanPrice(after.priceCents, before.currency)} (${move})`);
  }
  if (before.name !== after.name) parts.push(`name “${before.name}” → “${after.name}”`);
  if (before.bestFor !== after.bestFor) parts.push("description");
  if (before.comingSoon !== after.comingSoon) {
    parts.push(after.comingSoon ? "marked coming soon" : "marked available");
  }
  if (before.included && after.included) {
    const added = after.included.filter((key) => !before.included!.includes(key)).map(featureName);
    const removed = before.included.filter((key) => !after.included!.includes(key)).map(featureName);
    if (added.length) parts.push(`added ${added.join(", ")}`);
    if (removed.length) parts.push(`removed ${removed.join(", ")}`);
  }
  if (JSON.stringify(before.features) !== JSON.stringify(after.features)) parts.push("extra pricing lines");
  return parts.length ? `Changed ${parts.join(", ")}` : "No changes";
}

let cache: Map<BillingPlanKey, BillingPlan> | null = null;
/** Every Stripe price a plan has ever used, so older subscriptions still map to the right plan. */
let knownPriceIds = new Map<string, BillingPlanKey>();

/** Creates any missing plan rows from the built-in defaults and the Railway price ids, then caches them. */
export async function loadBillingPlans(): Promise<Map<BillingPlanKey, BillingPlan>> {
  for (const key of BILLING_PLAN_KEYS) {
    const defaults = DEFAULTS[key];
    await prisma.billingPlan.upsert({
      where: { key },
      create: {
        key,
        ...defaults,
        features: legacyExtraLines(defaults.features),
        includedFeatures: DEFAULT_PLAN_FEATURES[key],
        stripePriceId: envPriceId(key),
      },
      update: {},
    });
  }
  const untoggled = await prisma.billingPlan.findMany({ where: { includedFeatures: { equals: Prisma.DbNull } } });
  for (const row of untoggled) {
    if (!isBillingPlanKey(row.key)) continue;
    await prisma.billingPlan.update({
      where: { key: row.key },
      data: { includedFeatures: DEFAULT_PLAN_FEATURES[row.key], features: legacyExtraLines(featuresOf(row)) },
    });
  }
  const [rows, changes] = await Promise.all([
    prisma.billingPlan.findMany(),
    prisma.billingPlanChange.findMany({ select: { planKey: true, oldStripePriceId: true, newStripePriceId: true } }),
  ]);
  const next = new Map<BillingPlanKey, BillingPlan>();
  const ids = new Map<string, BillingPlanKey>();
  for (const key of BILLING_PLAN_KEYS) {
    const fromEnv = envPriceId(key);
    if (fromEnv) ids.set(fromEnv, key);
  }
  for (const change of changes) {
    if (!isBillingPlanKey(change.planKey)) continue;
    if (change.oldStripePriceId) ids.set(change.oldStripePriceId, change.planKey);
    if (change.newStripePriceId) ids.set(change.newStripePriceId, change.planKey);
  }
  for (const row of rows) {
    if (!isBillingPlanKey(row.key)) continue;
    next.set(row.key, row);
    if (row.stripePriceId) ids.set(row.stripePriceId, row.key);
  }
  cache = next;
  knownPriceIds = ids;
  setSavedPlanFeatures(
    Object.fromEntries([...next].map(([key, row]) => [key, includedOf(row)])) as Partial<Record<BillingPlanKey, string[]>>,
  );
  return next;
}

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const plans = cache ?? (await loadBillingPlans());
  return BILLING_PLAN_KEYS.map((key) => plans.get(key)).filter((plan): plan is BillingPlan => Boolean(plan));
}

/** The price new checkouts use. Falls back to Railway's ids until the plans table has loaded. */
export function activeStripePriceId(key: BillingPlanKey): string | null {
  return cache?.get(key)?.stripePriceId?.trim() || envPriceId(key);
}

export function planKeyOfStripePriceId(priceId: string | null | undefined): BillingPlanKey | null {
  const id = priceId?.trim();
  return id ? knownPriceIds.get(id) ?? null : null;
}

function displayPlanOf(plan: BillingPlan) {
  return { key: plan.key, name: plan.name, priceCents: plan.priceCents, included: includedOf(plan), extras: featuresOf(plan) };
}

/** `features` is the finished pricing-page list, so the apps and website just show it. */
export function serializePublicPlan(plan: BillingPlan, allPlans: BillingPlan[] = [...(cache?.values() ?? [])]) {
  const others = allPlans.some((other) => other.key === plan.key) ? allPlans : [...allPlans, plan];
  return {
    key: plan.key as BillingPlanKey,
    name: plan.name,
    bestFor: plan.bestFor,
    features: displayFeatureLines(displayPlanOf(plan), others.map(displayPlanOf)),
    includedFeatures: includedOf(plan),
    extraFeatures: featuresOf(plan),
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: plan.interval,
    priceLabel: formatPlanPrice(plan.priceCents, plan.currency),
    periodLabel: planPeriodLabel(plan.interval),
    comingSoon: plan.comingSoon,
  };
}

export type PlanEdit = {
  name: string;
  bestFor: string;
  features: string[];
  includedFeatures: string[];
  priceCents: number;
  comingSoon: boolean;
  existingSubscribers: ExistingSubscribers | null;
};

export type PlanEditResult =
  | { ok: true; plan: BillingPlan; changeId: string | null }
  | { ok: false; status: 400 | 404 | 502 | 503; code: string; message: string };

/**
 * Saves a plan edit. A new price becomes a new Stripe price on the same product (Stripe prices
 * can't be edited); new checkouts use it right away. Existing subscribers are moved only when asked.
 */
export async function updateBillingPlan(
  key: BillingPlanKey,
  edit: PlanEdit,
  actorId: string,
  stripe: Stripe | null,
): Promise<PlanEditResult> {
  await getBillingPlans();
  const current = cache?.get(key);
  if (!current) return { ok: false, status: 404, code: "NOT_FOUND", message: "Plan not found." };

  const features = cleanFeatures(edit.features);
  const included = cleanFeatureKeys(edit.includedFeatures);
  const priceChanged = edit.priceCents !== current.priceCents;
  if (priceChanged && !edit.existingSubscribers) {
    return { ok: false, status: 400, code: "CHOOSE_EXISTING", message: "Choose what happens to existing subscribers." };
  }

  let newPriceId = current.stripePriceId;
  const oldPriceId = activeStripePriceId(key);
  if (priceChanged) {
    if (!stripe) {
      return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "Billing isn't connected on this server, so prices can't change yet." };
    }
    try {
      const old = oldPriceId ? await stripe.prices.retrieve(oldPriceId) : null;
      const product =
        (old && (typeof old.product === "string" ? old.product : old.product.id)) ||
        (await stripe.products.create({ name: `Alenio ${edit.name}`, metadata: { plan: key } })).id;
      const created = await stripe.prices.create({
        product,
        currency: old?.currency ?? current.currency,
        unit_amount: edit.priceCents,
        recurring: { interval: old?.recurring?.interval === "year" ? "year" : "month" },
        nickname: `${edit.name} ${formatPlanPrice(edit.priceCents, current.currency)}`,
        metadata: { plan: dbPlanOfKey(key) },
      });
      newPriceId = created.id;
    } catch (error) {
      console.warn("[billing-plans] could not create Stripe price", key, error);
      return { ok: false, status: 502, code: "STRIPE_ERROR", message: "Billing didn't accept the new price. Nothing was changed." };
    }
  }

  const summary = describePlanEdit(
    { ...current, features: featuresOf(current), included: includedOf(current) },
    {
      name: edit.name,
      bestFor: edit.bestFor,
      priceCents: edit.priceCents,
      features,
      included,
      comingSoon: edit.comingSoon,
    },
    priceChanged ? edit.existingSubscribers : null,
  );
  const moving = priceChanged && edit.existingSubscribers === "move" && Boolean(oldPriceId);
  const [plan, change] = await prisma.$transaction([
    prisma.billingPlan.update({
      where: { key },
      data: {
        name: edit.name,
        bestFor: edit.bestFor,
        features,
        includedFeatures: included,
        priceCents: edit.priceCents,
        comingSoon: edit.comingSoon,
        stripePriceId: newPriceId,
        updatedById: actorId,
      },
    }),
    prisma.billingPlanChange.create({
      data: {
        planKey: key,
        summary,
        oldPriceCents: priceChanged ? current.priceCents : null,
        newPriceCents: priceChanged ? edit.priceCents : null,
        oldStripePriceId: priceChanged ? oldPriceId : null,
        newStripePriceId: priceChanged ? newPriceId : null,
        existingSubscribers: priceChanged ? edit.existingSubscribers ?? "keep" : "none",
        moveStatus: moving ? "running" : "none",
        actorId,
      },
    }),
  ]);
  await loadBillingPlans();
  if (moving && stripe && oldPriceId && newPriceId) void moveSubscribers(stripe, change.id, oldPriceId, newPriceId);
  return { ok: true, plan, changeId: change.id };
}

const MOVABLE_STATUSES: Stripe.SubscriptionListParams.Status[] = ["active", "trialing", "past_due"];

/** Switches every subscription on `fromPrice` to `toPrice` with no proration, so the new amount starts next bill. */
export async function moveSubscribers(stripe: Stripe, changeId: string, fromPrice: string, toPrice: string): Promise<void> {
  let moved = 0;
  let failed = 0;
  try {
    for (const status of MOVABLE_STATUSES) {
      for await (const subscription of stripe.subscriptions.list({ price: fromPrice, status, limit: 100 })) {
        const item = subscription.items.data.find((entry) => entry.price.id === fromPrice);
        if (!item) continue;
        try {
          await stripe.subscriptions.update(subscription.id, {
            items: [{ id: item.id, price: toPrice }],
            proration_behavior: "none",
          });
          moved += 1;
        } catch (error) {
          failed += 1;
          console.warn("[billing-plans] could not move subscription", subscription.id, error);
        }
      }
    }
    await prisma.billingPlanChange.update({
      where: { id: changeId },
      data: { moveStatus: failed ? "partial" : "done", movedCount: moved, moveFailedCount: failed },
    });
  } catch (error) {
    console.warn("[billing-plans] moving subscribers stopped", changeId, error);
    await prisma.billingPlanChange
      .update({ where: { id: changeId }, data: { moveStatus: "failed", movedCount: moved, moveFailedCount: failed } })
      .catch(() => undefined);
  }
}

/** Paying workspaces per plan, from our own subscription rows. */
export async function subscriberCounts(): Promise<Record<BillingPlanKey, number>> {
  const rows = await prisma.teamSubscription.groupBy({
    by: ["plan"],
    where: { status: { in: ["active", "trialing", "past_due"] }, stripeSubscriptionId: { not: null } },
    _count: { _all: true },
  });
  const counts: Record<BillingPlanKey, number> = { pro: 0, operations: 0 };
  for (const row of rows) {
    if (row.plan === "operations") counts.operations += row._count._all;
    else if (row.plan === "team" || row.plan === "pro") counts.pro += row._count._all;
  }
  return counts;
}
