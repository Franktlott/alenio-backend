import type { EnterpriseNavId } from "../components/EnterpriseLayout";

export const ENTERPRISE_NAV_TITLES: Record<EnterpriseNavId, string> = {
  activity: "Activity",
  chat: "Chat",
  execute: "Workspace",
  go: "Alenio Go",
  team: "Team",
  plan: "Billing",
  profile: "Profile",
  admin: "Admin",
};

export function enterpriseNavTitle(nav: EnterpriseNavId): string {
  return ENTERPRISE_NAV_TITLES[nav];
}

/** Regular members see Profile (their own card); leaders and owners see Team. */
export function enterpriseTeamNavTitle(role?: string | null): string {
  return role === "member" ? "Profile" : "Team";
}
