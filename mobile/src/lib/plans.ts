import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

export type PlanKey = "pro" | "operations";

export type PublicPlan = {
  key: PlanKey;
  name: string;
  bestFor: string;
  features: string[];
  priceCents: number;
  currency: string;
  interval: string;
  priceLabel: string;
  periodLabel: string;
};

/** Shown until the server answers, and if it can't be reached. Prices are edited in Admin tools. */
export const FALLBACK_PLANS: Record<PlanKey, PublicPlan> = {
  pro: {
    key: "pro",
    name: "Pro",
    bestFor: "Team communication, tasks, development, calendar, chat, and core workspace features.",
    features: ["Tasks and priorities", "Team calendar", "Coaching and Seneca", "Insights and development"],
    priceCents: 3999,
    currency: "usd",
    interval: "month",
    priceLabel: "$39.99",
    periodLabel: "per workspace / month",
  },
  operations: {
    key: "operations",
    name: "Operations",
    bestFor: "Everything in Pro plus Alenio Go (checklists, temperature checks, briefings, walks, execution tools).",
    features: ["Everything in Pro", "Alenio Go checklists and walks", "Temperature checks", "Shift operations tools"],
    priceCents: 6999,
    currency: "usd",
    interval: "month",
    priceLabel: "$69.99",
    periodLabel: "per workspace / month",
  },
};

/** Current plans keyed by plan, always filled in. */
export function usePlans(): Record<PlanKey, PublicPlan> {
  const { data } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => api.get<PublicPlan[]>("/api/public/plans"),
    staleTime: 60_000,
    retry: 1,
  });
  const out = { ...FALLBACK_PLANS };
  for (const plan of data ?? []) {
    if (plan.key === "pro" || plan.key === "operations") out[plan.key] = plan;
  }
  return out;
}

/** "per workspace / month" → "workspace / month" for tight price rows. */
export function shortPeriod(plan: PublicPlan): string {
  return plan.periodLabel.replace(/^per /, "");
}
