/** Store-safe copy: no external purchase links, prices tied to checkout, or payment provider names. */

const PAID_ACTIVE_STATUSES = ["active", "trialing", "past_due", "incomplete", "paused"] as const;

/** Align with backend teamSubscriptionRowHasTeamFeatures (plan + paid-active status). */
export function hasTeamPlan(
  sub?: { plan?: string | null; status?: string | null; hasTeamFeatures?: boolean | null } | null,
): boolean {
  if (typeof sub?.hasTeamFeatures === "boolean") return sub.hasTeamFeatures;
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  if (plan !== "team" && plan !== "pro" && plan !== "operations") return false;
  const status = (sub?.status ?? "active").trim().toLowerCase();
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Use live subscription when loaded; otherwise fall back to persisted workspace plan. */
export function hasWorkspaceTaskAccess(
  subscription: { plan?: string | null; status?: string | null; hasTeamFeatures?: boolean | null } | null | undefined,
  persistedPlan: "free" | "team",
): boolean {
  if (subscription) return hasTeamPlan(subscription);
  return persistedPlan === "team";
}

export const PLAN_SCREEN_TITLE = "Workplace Access";

export const ACCOUNT_HUB_TITLE = "Plan & Access";

export function workplaceAccessSubtitle(isOwner: boolean): string {
  if (isOwner) {
    return "This workplace's access is managed on the web. You can upgrade the workplace, manage billing, and view invoices from the Alenio web dashboard.";
  }
  return "This workplace's access is managed on the web. Your administrator can upgrade the workplace, manage billing, and view invoices from the Alenio web dashboard.";
}

export const WEB_WORKSPACE_DASHBOARD_URL = "https://alenio.com/billing";

export function webBillingUrlForTeam(teamId?: string, opts?: { subscribe?: boolean }): string {
  const params = new URLSearchParams();
  if (teamId?.trim()) params.set("teamId", teamId.trim());
  if (opts?.subscribe) params.set("subscribe", "1");
  const qs = params.toString();
  return qs ? `${WEB_WORKSPACE_DASHBOARD_URL}?${qs}` : WEB_WORKSPACE_DASHBOARD_URL;
}

export const WEB_PLAN_MANAGEMENT_TITLE = "Manage on the web";

export const WEB_PLAN_MANAGEMENT_BODY =
  "Upgrade, add locations, manage billing, and view invoices in your workplace dashboard.";

export const OPEN_WEB_DASHBOARD_LABEL = "Open Web Dashboard";

export function ownerFreePlanMessage(): string {
  return "Pro features require an active Pro subscription for this workplace. Enable Pro on the web using the account that owns this workplace.";
}

export function memberFreePlanMessage(): string {
  return "Ask your workplace owner to enable Pro for this workplace.";
}

export function teamActiveMessage(isOwner: boolean): string {
  if (isOwner) {
    return "You own this workplace's Pro plan. Premium features are unlocked for all members.";
  }
  return "You are a Pro plan member. Premium features are unlocked for all members in this workplace.";
}

export const PAYWALL_TITLE = "Pro plan required";

export const PAYWALL_BODY =
  "Tasks, Workspace, and Activity are included with the Pro plan. View what is included in Workplace Access.";
