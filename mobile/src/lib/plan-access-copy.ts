/** Store-safe copy: no external purchase links, prices tied to checkout, or payment provider names. */

export function hasTeamPlan(sub?: { plan?: string | null } | null): boolean {
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  return plan === "team" || plan === "pro";
}

/** Use live subscription when loaded; otherwise fall back to persisted workspace plan. */
export function hasWorkspaceTaskAccess(
  subscription: { plan?: string | null } | null | undefined,
  persistedPlan: "free" | "team",
): boolean {
  if (subscription) return hasTeamPlan(subscription);
  return persistedPlan === "team";
}

export const PLAN_SCREEN_TITLE = "Workplace Access";

export function workplaceAccessSubtitle(isOwner: boolean): string {
  if (isOwner) {
    return "This workplace's access is managed on the web. You can upgrade the workplace, manage billing, and view invoices from the Alenio web dashboard.";
  }
  return "This workplace's access is managed on the web. Your administrator can upgrade the workplace, manage billing, and view invoices from the Alenio web dashboard.";
}

export const WEB_WORKSPACE_DASHBOARD_URL = "https://alenio.app/billing";

export const WEB_PLAN_MANAGEMENT_TITLE = "Manage on the web";

export const WEB_PLAN_MANAGEMENT_BODY =
  "Upgrade, add locations, manage billing, and view invoices in your workplace dashboard.";

export const OPEN_WEB_DASHBOARD_LABEL = "Open Web Dashboard";

export function ownerFreePlanMessage(): string {
  return "Team features require an active Team subscription for this workplace. Enable Team on the web using the account that owns this workplace.";
}

export function memberFreePlanMessage(): string {
  return "Ask your workplace owner to enable Team for this workplace.";
}

export function teamActiveMessage(isOwner: boolean): string {
  if (isOwner) {
    return "You own this workplace's Team plan. Premium features are unlocked for all members.";
  }
  return "You are a Team plan member. Premium features are unlocked for all members in this workplace.";
}

export const PAYWALL_TITLE = "Team plan required";

export const PAYWALL_BODY =
  "Group chats are included with the Team plan. View what is included in Workplace Access.";
