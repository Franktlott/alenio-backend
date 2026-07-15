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
