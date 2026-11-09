/** Plan keys as the apps know them. Pro is stored on subscriptions as the legacy `team`. */
export const BILLING_PLAN_KEYS = ["pro", "operations"] as const;
export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

export type PlanFeatureGroup = "workspace" | "go";

export type PlanFeature = {
  key: string;
  name: string;
  group: PlanFeatureGroup;
  /** Turning it off really removes access. Others only change what the pricing page lists. */
  locksAccess: boolean;
  /** Always included in every paid plan. */
  required?: boolean;
  /** Alenio Go module this feature unlocks. */
  moduleKey?: string;
};

/** Every feature a plan can include. Add here only when the app has something to switch. */
export const PLAN_FEATURES: PlanFeature[] = [
  { key: "workspace", name: "Tasks & action items", group: "workspace", locksAccess: true, required: true },
  { key: "seneca", name: "Seneca AI coaching assistant", group: "workspace", locksAccess: true },
  { key: "check_ins", name: "Check-ins with Seneca prep", group: "workspace", locksAccess: false },
  { key: "development", name: "Development plans & Seneca goal generation", group: "workspace", locksAccess: false },
  { key: "calendar", name: "Team calendar", group: "workspace", locksAccess: false },
  { key: "outlook_sync", name: "Outlook calendar sync (private, read-only)", group: "workspace", locksAccess: false },
  { key: "metrics", name: "Metrics & dashboards", group: "workspace", locksAccess: false },
  { key: "insights", name: "Performance insights", group: "workspace", locksAccess: false },
  { key: "priority_support", name: "Priority support", group: "workspace", locksAccess: false },
  { key: "go_checklists", name: "Alenio Go checklists", group: "go", locksAccess: true, moduleKey: "checklists" },
  { key: "go_temp_checks", name: "Temperature checks", group: "go", locksAccess: true, moduleKey: "temp-checks" },
  { key: "go_briefings", name: "Shift briefings", group: "go", locksAccess: true, moduleKey: "briefings" },
  { key: "go_walks", name: "Guided walks", group: "go", locksAccess: true, moduleKey: "walks" },
];

const FEATURE_BY_KEY = new Map(PLAN_FEATURES.map((feature) => [feature.key, feature]));
const REQUIRED_KEYS = PLAN_FEATURES.filter((feature) => feature.required).map((feature) => feature.key);

export const DEFAULT_PLAN_FEATURES: Record<BillingPlanKey, string[]> = {
  pro: PLAN_FEATURES.filter((feature) => feature.group === "workspace").map((feature) => feature.key),
  operations: PLAN_FEATURES.map((feature) => feature.key),
};

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === "string" && (BILLING_PLAN_KEYS as readonly string[]).includes(value);
}

/** Subscription rows store Pro as `team`; anything else (free, enterprise) isn't a sold plan. */
export function billingKeyOfDbPlan(plan: string | null | undefined): BillingPlanKey | null {
  const value = plan?.trim().toLowerCase();
  if (value === "team" || value === "pro") return "pro";
  if (value === "operations") return "operations";
  return null;
}

/** Known keys only, in catalog order, with required features always on. */
export function cleanFeatureKeys(keys: unknown): string[] {
  const wanted = new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : []);
  for (const key of REQUIRED_KEYS) wanted.add(key);
  return PLAN_FEATURES.filter((feature) => wanted.has(feature.key)).map((feature) => feature.key);
}

let saved: Partial<Record<BillingPlanKey, string[]>> = {};

/** Called whenever plans are (re)loaded so access checks follow the admin's toggles. */
export function setSavedPlanFeatures(next: Partial<Record<BillingPlanKey, string[]>>): void {
  saved = next;
}

export function featuresOfPlanKey(key: BillingPlanKey): string[] {
  return saved[key] ?? DEFAULT_PLAN_FEATURES[key];
}

export function featuresOfDbPlan(plan: string | null | undefined): string[] {
  const key = billingKeyOfDbPlan(plan);
  return key ? featuresOfPlanKey(key) : [];
}

export function hasGoFeature(features: readonly string[]): boolean {
  return features.some((key) => FEATURE_BY_KEY.get(key)?.group === "go");
}

export function featureKeyOfModule(moduleKey: string): string | null {
  return PLAN_FEATURES.find((feature) => feature.moduleKey === moduleKey)?.key ?? null;
}

export function featureName(key: string): string {
  return FEATURE_BY_KEY.get(key)?.name ?? key;
}

type DisplayPlan = { key: string; name: string; priceCents: number; included: string[]; extras: string[] };

/**
 * Pricing-page lines: a cheaper plan this one fully contains becomes "Everything in X",
 * then the included features it adds, then the admin's extra lines.
 */
export function displayFeatureLines(plan: DisplayPlan, allPlans: DisplayPlan[]): string[] {
  const own = new Set(plan.included);
  const base = allPlans
    .filter((other) => other.key !== plan.key && other.priceCents < plan.priceCents && other.included.length > 0)
    .filter((other) => other.included.every((key) => own.has(key)))
    .sort((a, b) => b.included.length - a.included.length)[0];
  const covered = new Set(base?.included ?? []);
  const lines = base ? [`Everything in ${base.name}`] : [];
  for (const key of plan.included) if (!covered.has(key)) lines.push(featureName(key));
  const seen = new Set(lines.map((line) => line.toLowerCase()));
  for (const extra of plan.extras) {
    if (!seen.has(extra.toLowerCase())) lines.push(extra);
  }
  return lines;
}

/** Old free-text lines the catalog now covers, dropped once when a plan first gets toggles. */
const COVERED_LEGACY_LINES = new Set(
  [
    ...PLAN_FEATURES.map((feature) => feature.name),
    "Everything in Pro",
    "Alenio Go — checklists & temperature checks",
    "Shift briefings & walks",
  ].map((line) => line.toLowerCase()),
);

export function legacyExtraLines(lines: string[]): string[] {
  return lines.filter((line) => !COVERED_LEGACY_LINES.has(line.trim().toLowerCase()));
}
