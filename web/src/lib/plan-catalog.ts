/** Shared Free / Team plan copy for billing (app) and public pricing (website). */

export const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;
export const FREE_LOCKED = ["Tasks & action items", "Metrics & dashboards", "Team calendar", "Performance insights"] as const;
export const TEAM_FEATURES = [
  "Tasks & action items",
  "Team calendar",
  "Metrics & dashboards",
  "Workflow execution",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

export const TEAM_PRICE_AMOUNT = "$19";
export const TEAM_PRICE_PERIOD = "per workspace / month";
