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

export const PLAN_SCREEN_TITLE = "Plan & access";

export const PLAN_SCREEN_SUBTITLE =
  "Each workspace has its own plan. This screen shows what is included — subscriptions are not purchased in the mobile app.";

export function ownerFreePlanMessage(): string {
  return "Team features require an active Team subscription for this workspace. Enable Team outside the mobile app using the account that owns this workspace.";
}

export function memberFreePlanMessage(): string {
  return "Ask your workspace owner to enable Team for this workspace.";
}

export function teamActiveMessage(): string {
  return "This workspace has Team access. Premium features are unlocked for all members.";
}

export const PAYWALL_TITLE = "Team plan required";

export const PAYWALL_BODY =
  "Group chats are included with the Team plan. View what is included on the plan screen.";
