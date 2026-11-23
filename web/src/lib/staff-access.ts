import type { WebMeUser } from "./api";

/** Mirrors backend/src/lib/staff-roles.ts. The server is the one that enforces these. */
export type StaffAbility =
  | "overview.view"
  | "users.view"
  | "users.edit"
  | "users.create"
  | "users.delete"
  | "teams.view"
  | "teams.edit"
  | "orgs.view"
  | "orgs.edit"
  | "content.view"
  | "content.edit"
  | "seneca.view"
  | "seneca.edit"
  | "activity.view"
  | "staff.manage"
  | "notifications.view"
  | "notifications.create"
  | "notifications.approve"
  | "pricing.manage";

export type StaffRole = "super_admin" | "support" | "content_editor" | "read_only";

export const STAFF_ROLE_OPTIONS: Array<{ role: StaffRole; label: string; description: string }> = [
  { role: "super_admin", label: "Super Admin", description: "Everything, including giving out staff roles." },
  { role: "support", label: "Support", description: "View users and workspaces and fix account details." },
  { role: "content_editor", label: "Content Editor", description: "Write Discover articles and draft push notifications." },
  { role: "read_only", label: "Read-only", description: "See every admin page, change nothing." },
];

export function staffRoleLabel(role: StaffRole | null | undefined): string {
  return STAFF_ROLE_OPTIONS.find((option) => option.role === role)?.label ?? "Member";
}

type StaffMe = Pick<WebMeUser, "accountType" | "staffAbilities"> | null | undefined;

export function isStaff(me: StaffMe): boolean {
  return me?.accountType === "platform_admin";
}

export function staffCan(me: StaffMe, ability: StaffAbility): boolean {
  if (!isStaff(me)) return false;
  // A server from before staff roles sends no abilities; its admins had full access.
  if (!Array.isArray(me?.staffAbilities)) return true;
  return me.staffAbilities.includes(ability);
}

const PAGES: Array<{ prefix: string; ability: StaffAbility }> = [
  { prefix: "/admin/users", ability: "users.view" },
  { prefix: "/admin/workspaces", ability: "teams.view" },
  { prefix: "/admin/discover", ability: "content.view" },
  { prefix: "/admin/home-insights", ability: "content.view" },
  { prefix: "/admin/home-workspace", ability: "content.view" },
  { prefix: "/admin/feed-posts", ability: "content.view" },
  { prefix: "/admin/seneca", ability: "seneca.view" },
  { prefix: "/admin/notifications", ability: "notifications.view" },
  { prefix: "/admin/activity", ability: "activity.view" },
];

/** The ability an Admin tools page needs, or null for paths that aren't staff pages. */
export function abilityForAdminPath(pathname: string): StaffAbility | null {
  return PAGES.find((page) => pathname.startsWith(page.prefix))?.ability ?? null;
}

/** Where to land a staff member who opens Admin tools: the first page they can use. */
export function firstAdminPath(me: StaffMe): string | null {
  return PAGES.find((page) => staffCan(me, page.ability))?.prefix ?? null;
}
