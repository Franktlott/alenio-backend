import { useQuery } from "@tanstack/react-query";
import { apiGetJson, apiPatchJson } from "./api";
import {
  OPERATIONS_BEST_FOR,
  OPERATIONS_FEATURES,
  OPERATIONS_PRICE_AMOUNT,
  OPERATIONS_PRICE_PERIOD,
  PRO_BEST_FOR,
  PRO_FEATURES,
  PRO_PRICE_AMOUNT,
  PRO_PRICE_PERIOD,
} from "./plan-catalog";

export type PlanKey = "pro" | "operations";

export type PublicPlan = {
  key: PlanKey;
  name: string;
  bestFor: string;
  /** Finished pricing-page list. */
  features: string[];
  includedFeatures?: string[];
  extraFeatures?: string[];
  priceCents: number;
  currency: string;
  interval: string;
  priceLabel: string;
  periodLabel: string;
  /** When true, apps and pricing show the plan as unavailable. */
  comingSoon: boolean;
};

export type PlanFeature = {
  key: string;
  name: string;
  group: "workspace" | "go";
  locksAccess: boolean;
  required?: boolean;
};

export type AdminPlan = PublicPlan & { subscribers: number; hasStripePrice: boolean; updatedAt: string };

export type PlanChange = {
  id: string;
  planKey: PlanKey;
  summary: string;
  existingSubscribers: "none" | "keep" | "move";
  moveStatus: "none" | "running" | "done" | "partial" | "failed";
  movedCount: number;
  moveFailedCount: number;
  createdAt: string;
  actorName: string;
};

export type AdminPricing = {
  billingConnected: boolean;
  googlePlay?: { connected: boolean; reported: number; waiting: number; failed: number };
  catalog: PlanFeature[];
  plans: AdminPlan[];
  history: PlanChange[];
};

export type PlanEdit = {
  name: string;
  bestFor: string;
  features: string[];
  includedFeatures: string[];
  priceCents: number;
  comingSoon: boolean;
  existingSubscribers?: "keep" | "move" | null;
};

type DisplayPlan = { key: string; name: string; priceCents: number; included: string[]; extras: string[] };

/** Same rule as the server: a cheaper plan this one fully contains becomes "Everything in X". */
export function displayFeatureLines(plan: DisplayPlan, allPlans: DisplayPlan[], catalog: PlanFeature[]): string[] {
  const nameOf = new Map(catalog.map((feature) => [feature.key, feature.name]));
  const own = new Set(plan.included);
  const base = allPlans
    .filter((other) => other.key !== plan.key && other.priceCents < plan.priceCents && other.included.length > 0)
    .filter((other) => other.included.every((key) => own.has(key)))
    .sort((a, b) => b.included.length - a.included.length)[0];
  const covered = new Set(base?.included ?? []);
  const lines = base ? [`Everything in ${base.name}`] : [];
  for (const key of plan.included) if (!covered.has(key)) lines.push(nameOf.get(key) ?? key);
  const seen = new Set(lines.map((line) => line.toLowerCase()));
  for (const extra of plan.extras) if (!seen.has(extra.toLowerCase())) lines.push(extra);
  return lines;
}

/** Shown until the server answers, and if it can't be reached. */
export const FALLBACK_PLANS: Record<PlanKey, PublicPlan> = {
  pro: {
    key: "pro",
    name: "Pro",
    bestFor: PRO_BEST_FOR,
    features: [...PRO_FEATURES],
    priceCents: 3999,
    currency: "usd",
    interval: "month",
    priceLabel: PRO_PRICE_AMOUNT,
    periodLabel: PRO_PRICE_PERIOD,
    comingSoon: false,
  },
  operations: {
    key: "operations",
    name: "Operations",
    bestFor: OPERATIONS_BEST_FOR,
    features: [...OPERATIONS_FEATURES],
    priceCents: 6999,
    currency: "usd",
    interval: "month",
    priceLabel: OPERATIONS_PRICE_AMOUNT,
    periodLabel: OPERATIONS_PRICE_PERIOD,
    comingSoon: true,
  },
};

export const PLANS_QUERY_KEY = ["public-plans"] as const;

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const res = await apiGetJson<{ data: PublicPlan[] }>("/api/public/plans");
  return res.data;
}

/** The current plans keyed by plan, always filled in (falls back to the built-in copy). */
export function usePlans(): Record<PlanKey, PublicPlan> {
  const query = useQuery({ queryKey: PLANS_QUERY_KEY, queryFn: fetchPublicPlans, staleTime: 60_000, retry: 1 });
  const out = { ...FALLBACK_PLANS };
  for (const plan of query.data ?? []) {
    if (plan.key === "pro" || plan.key === "operations") {
      out[plan.key] = { ...FALLBACK_PLANS[plan.key], ...plan, comingSoon: plan.comingSoon ?? FALLBACK_PLANS[plan.key].comingSoon };
    }
  }
  return out;
}

export async function fetchAdminPricing(): Promise<AdminPricing> {
  const res = await apiGetJson<{ data: AdminPricing }>("/api/admin/pricing");
  return res.data;
}

export async function updatePlan(key: PlanKey, edit: PlanEdit): Promise<PublicPlan> {
  const res = await apiPatchJson<{ data: PublicPlan }>(`/api/admin/pricing/${key}`, edit);
  return res.data;
}

/** "$39.99" or "39.99" → 3999. Returns null when it isn't a price. */
export function parsePriceInput(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
