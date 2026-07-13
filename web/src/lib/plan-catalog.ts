/** Shared Free / Pro / Operations plan copy for billing (app) and public pricing (website). */

export const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;

export const FREE_LOCKED = [
  "Tasks & action items",
  "Seneca AI coaching",
  "Check-ins & development plans",
  "Metrics & dashboards",
  "Team calendar",
  "Performance insights",
] as const;

/** Core workspace features (paid Pro). Alenio Go lives on Operations. */
export const PRO_FEATURES = [
  "Tasks & action items",
  "Seneca AI coaching assistant",
  "Check-ins with Seneca prep",
  "Development plans & Seneca goal generation",
  "Team calendar",
  "Outlook calendar sync (private, read-only)",
  "Metrics & dashboards",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

export const OPERATIONS_FEATURES = [
  "Everything in Pro",
  "Alenio Go — checklists & temperature checks",
  "Shift briefings & walks",
  "Workflow execution tools",
  "Floor-ready ops workflows",
] as const;

export const FREE_BEST_FOR = "Small teams evaluating Alenio.";
export const PRO_BEST_FOR =
  "Team communication, tasks, development, calendar, chat, and core workspace features.";
export const OPERATIONS_BEST_FOR =
  "Everything in Pro plus Alenio Go (checklists, temperature checks, briefings, walks, execution tools).";

export const PRO_PRICE_AMOUNT = "$39.99";
export const PRO_PRICE_PERIOD = "per workspace / month";
export const OPERATIONS_PRICE_AMOUNT = "$69.99";
export const OPERATIONS_PRICE_PERIOD = "per workspace / month";

/** @deprecated Prefer PRO_* — kept for any lingering imports during rename. */
export const TEAM_FEATURES = PRO_FEATURES;
export const TEAM_PRICE_AMOUNT = PRO_PRICE_AMOUNT;
export const TEAM_PRICE_PERIOD = PRO_PRICE_PERIOD;

/** Compact feature matrix for in-app billing (Free vs Pro vs Operations). */
export const BILLING_COMPARE_FEATURES = [
  { name: "Activity feed", free: true, pro: true, operations: true },
  { name: "Team chat", free: true, pro: true, operations: true },
  { name: "Team members", free: true, pro: true, operations: true },
  { name: "Tasks & action items", free: false, pro: true, operations: true },
  { name: "Seneca AI coaching", free: false, pro: true, operations: true },
  { name: "Check-ins & development plans", free: false, pro: true, operations: true },
  { name: "Team calendar", free: false, pro: true, operations: true },
  { name: "Outlook calendar sync", free: false, pro: true, operations: true },
  { name: "Metrics & dashboards", free: false, pro: true, operations: true },
  { name: "Performance insights", free: false, pro: true, operations: true },
  { name: "Celebrations & shoutouts", free: false, pro: true, operations: true },
  { name: "Alenio Go (checklists, walks, briefings)", free: false, pro: false, operations: true },
  { name: "Workflow execution & temperature checks", free: false, pro: false, operations: true },
  { name: "Priority support", free: false, pro: true, operations: true },
] as const;
