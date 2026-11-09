/**
 * Alenio staff access. A staff account is a separate login (accountType
 * "platform_admin"); its staff role decides what it can do in Admin tools.
 *
 * Abilities are the unit the server checks. Roles are fixed bundles of them,
 * so a role builder can later sit on top of this list without changing checks.
 */

export const STAFF_ABILITIES = [
  "overview.view",
  "users.view",
  "users.edit",
  "users.create",
  "users.delete",
  "teams.view",
  "teams.edit",
  "orgs.view",
  "orgs.edit",
  "content.view",
  "content.edit",
  "seneca.view",
  "seneca.edit",
  "activity.view",
  "staff.manage",
  "notifications.view",
  "notifications.create",
  "notifications.approve",
  "pricing.manage",
] as const;

export type StaffAbility = (typeof STAFF_ABILITIES)[number];

export const STAFF_ROLES = ["super_admin", "support", "content_editor", "read_only"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  support: "Support",
  content_editor: "Content Editor",
  read_only: "Read-only",
};

const VIEW_ALL: StaffAbility[] = [
  "overview.view",
  "users.view",
  "teams.view",
  "orgs.view",
  "content.view",
  "seneca.view",
  "activity.view",
  "notifications.view",
];

const ROLE_ABILITIES: Record<StaffRole, ReadonlySet<StaffAbility>> = {
  super_admin: new Set(STAFF_ABILITIES),
  support: new Set<StaffAbility>([
    "overview.view",
    "users.view",
    "users.edit",
    "teams.view",
    "orgs.view",
    "activity.view",
  ]),
  content_editor: new Set<StaffAbility>([
    "overview.view",
    "content.view",
    "content.edit",
    "notifications.view",
    "notifications.create",
  ]),
  read_only: new Set<StaffAbility>(VIEW_ALL),
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * The role a user actually has. Staff accounts created before roles existed
 * have none stored and keep the full access they always had.
 */
export function effectiveStaffRole(user: { accountType?: string | null; staffRole?: string | null } | null | undefined): StaffRole | null {
  if (user?.accountType !== "platform_admin") return null;
  return isStaffRole(user.staffRole) ? user.staffRole : "super_admin";
}

export function staffAbilities(role: StaffRole | null): StaffAbility[] {
  if (!role) return [];
  return STAFF_ABILITIES.filter((ability) => ROLE_ABILITIES[role].has(ability));
}

export function roleHasAbility(role: StaffRole | null, ability: StaffAbility): boolean {
  return role ? ROLE_ABILITIES[role].has(ability) : false;
}

/** Fields the apps read to shape Admin tools around the signed-in staff member. */
export function staffAccessFields(user: { accountType?: string | null; staffRole?: string | null } | null | undefined) {
  const role = effectiveStaffRole(user);
  return { staffRole: role, staffAbilities: staffAbilities(role) };
}
