/** Shared Free / Team plan copy for billing (app) and public pricing (website). */

export const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;
export const FREE_LOCKED = [
  "Tasks & action items",
  "Seneca AI coaching",
  "1:1 check-ins & development plans",
  "Metrics & dashboards",
  "Team calendar",
  "Performance insights",
] as const;
export const TEAM_FEATURES = [
  "Tasks & action items",
  "Seneca AI coaching assistant",
  "1:1 check-ins with Seneca prep",
  "Development plans & Seneca goal generation",
  "Team calendar",
  "Outlook calendar sync (private, read-only)",
  "Metrics & dashboards",
  "Workflow execution & checklists",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

export const TEAM_PRICE_AMOUNT = "$19";
export const TEAM_PRICE_PERIOD = "per workspace / month";

/** Compact feature matrix for in-app billing (Free vs Team). */
export const BILLING_COMPARE_FEATURES = [
  { name: "Activity feed", free: true },
  { name: "Team chat", free: true },
  { name: "Team members", free: true },
  { name: "Tasks & action items", free: false },
  { name: "Seneca AI coaching", free: false },
  { name: "1:1 check-ins & development plans", free: false },
  { name: "Team calendar", free: false },
  { name: "Outlook calendar sync", free: false },
  { name: "Metrics & dashboards", free: false },
  { name: "Workflow execution & checklists", free: false },
  { name: "Performance insights", free: false },
  { name: "Celebrations & shoutouts", free: false },
  { name: "Priority support", free: false },
] as const;
