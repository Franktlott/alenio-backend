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
  "Metrics & dashboards",
  "Workflow execution & checklists",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

export const TEAM_PRICE_AMOUNT = "$19";
export const TEAM_PRICE_PERIOD = "per workspace / month";
