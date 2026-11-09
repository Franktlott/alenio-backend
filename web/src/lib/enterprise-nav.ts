import type { EnterpriseNavId } from "../components/EnterpriseLayout";

export const ENTERPRISE_NAV_TITLES: Record<EnterpriseNavId, string> = {
  activity: "Activity",
  home: "Home",
  chat: "Chat",
  workspace: "Workspace",
  network: "Network",
  execute: "Workspace",
  go: "Alenio Go",
  workspaces: "Corporate Workspaces",
  users: "Users",
  team: "Team",
  plan: "Billing",
  settings: "Workspaces",
  admin: "Admin",
  discover: "Discover",
  content: "Content",
  adminUsers: "Users",
  adminWorkspaces: "Workspaces",
  adminSeneca: "Seneca",
  adminActivity: "Activity",
  adminNotifications: "Notifications",
  adminPricing: "Pricing",
  seneca: "Seneca",
};

export function enterpriseNavTitle(nav: EnterpriseNavId, opts?: { goLabel?: string }): string {
  if (nav === "go" && opts?.goLabel) return opts.goLabel;
  return ENTERPRISE_NAV_TITLES[nav];
}

/** Regular members see Profile (their own card); leaders and owners see Team. */
export function enterpriseTeamNavTitle(role?: string | null): string {
  return role === "member" ? "Profile" : "Team";
}
