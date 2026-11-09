import { describe, expect, test } from "bun:test";
import {
  effectiveStaffRole,
  roleHasAbility,
  staffAbilities,
  STAFF_ABILITIES,
  type StaffAbility,
} from "./staff-roles";
import { checkStaffRoleChange, checkUserEmailChange } from "./admin-platform";

const staff = (staffRole: string | null) => ({ accountType: "platform_admin", staffRole });

describe("effectiveStaffRole", () => {
  test("members have no staff role, even with one stored", () => {
    expect(effectiveStaffRole({ accountType: "member", staffRole: "super_admin" })).toBeNull();
    expect(effectiveStaffRole(null)).toBeNull();
  });

  test("staff accounts from before roles keep full access", () => {
    expect(effectiveStaffRole(staff(null))).toBe("super_admin");
    expect(effectiveStaffRole(staff("not-a-role"))).toBe("super_admin");
  });

  test("a stored role is used as-is", () => {
    expect(effectiveStaffRole(staff("support"))).toBe("support");
  });
});

describe("role abilities", () => {
  const can = (role: Parameters<typeof roleHasAbility>[0], ability: StaffAbility) => roleHasAbility(role, ability);

  test("Super Admin has every ability", () => {
    expect(staffAbilities("super_admin")).toEqual([...STAFF_ABILITIES]);
  });

  test("Support fixes accounts but cannot delete, manage staff, or touch content and Seneca", () => {
    expect(can("support", "users.view")).toBe(true);
    expect(can("support", "users.edit")).toBe(true);
    expect(can("support", "teams.view")).toBe(true);
    expect(can("support", "activity.view")).toBe(true);
    for (const ability of ["users.delete", "users.create", "staff.manage", "teams.edit", "orgs.edit", "content.view", "content.edit", "seneca.view", "seneca.edit"] as const) {
      expect(can("support", ability)).toBe(false);
    }
  });

  test("Content Editor reaches Discover and can draft notifications", () => {
    expect(can("content_editor", "content.edit")).toBe(true);
    expect(can("content_editor", "notifications.view")).toBe(true);
    expect(can("content_editor", "notifications.create")).toBe(true);
    for (const ability of ["users.view", "teams.view", "orgs.view", "seneca.view", "activity.view", "staff.manage", "notifications.approve"] as const) {
      expect(can("content_editor", ability)).toBe(false);
    }
  });

  test("only Super Admin can approve notifications", () => {
    expect(can("super_admin", "notifications.approve")).toBe(true);
    for (const role of ["support", "content_editor", "read_only"] as const) {
      expect(can(role, "notifications.approve")).toBe(false);
    }
    expect(can("support", "notifications.view")).toBe(false);
  });

  test("Read-only can view every area and change nothing", () => {
    for (const ability of STAFF_ABILITIES) {
      expect(can("read_only", ability)).toBe(ability.endsWith(".view"));
    }
  });

  test("no role means no abilities", () => {
    expect(staffAbilities(null)).toEqual([]);
    expect(can(null, "overview.view")).toBe(false);
  });
});

describe("checkStaffRoleChange", () => {
  const base = {
    actorId: "me",
    superAdminCount: 2,
    pinnedEmails: [] as string[],
  };
  const target = (overrides: Partial<{ id: string; email: string; accountType: string; staffRole: string | null }> = {}) => ({
    id: "u2",
    email: "sam@lotttechnologies.com",
    accountType: "member",
    staffRole: null,
    ...overrides,
  });

  test("gives a company account a staff role", () => {
    expect(checkStaffRoleChange({ ...base, target: target(), nextRole: "support" })).toBeNull();
  });

  test("only company accounts can be Super Admin", () => {
    expect(checkStaffRoleChange({ ...base, target: target({ email: "sam@gmail.com" }), nextRole: "super_admin" })).toBe(
      "DOMAIN_NOT_ALLOWED",
    );
  });

  test("outside email domains can hold the other staff roles", () => {
    for (const role of ["support", "content_editor", "read_only"] as const) {
      expect(checkStaffRoleChange({ ...base, target: target({ email: "sam@gmail.com" }), nextRole: role })).toBeNull();
    }
  });

  test("a regular member can always be left as a member", () => {
    expect(checkStaffRoleChange({ ...base, target: target({ email: "sam@gmail.com" }), nextRole: null })).toBeNull();
  });

  test("nobody can change their own role", () => {
    const self = target({ id: "me", accountType: "platform_admin", staffRole: "support" });
    expect(checkStaffRoleChange({ ...base, target: self, nextRole: "super_admin" })).toBe("SELF_CHANGE");
  });

  test("keeps at least one Super Admin", () => {
    const lastOne = target({ accountType: "platform_admin", staffRole: "super_admin" });
    expect(checkStaffRoleChange({ ...base, superAdminCount: 1, target: lastOne, nextRole: "support" })).toBe(
      "LAST_SUPER_ADMIN",
    );
    expect(checkStaffRoleChange({ ...base, superAdminCount: 2, target: lastOne, nextRole: "support" })).toBeNull();
  });

  test("a legacy admin with no stored role counts as a Super Admin", () => {
    const legacy = target({ accountType: "platform_admin", staffRole: null });
    expect(checkStaffRoleChange({ ...base, superAdminCount: 1, target: legacy, nextRole: null })).toBe("LAST_SUPER_ADMIN");
  });

  test("pinned emails stay Super Admin", () => {
    const pinned = target({ accountType: "platform_admin", staffRole: "super_admin" });
    expect(
      checkStaffRoleChange({ ...base, pinnedEmails: ["sam@lotttechnologies.com"], target: pinned, nextRole: "read_only" }),
    ).toBe("ALLOWLISTED");
  });

  test("setting the same role again is allowed and changes nothing", () => {
    const self = target({ id: "me", accountType: "platform_admin", staffRole: "super_admin" });
    expect(checkStaffRoleChange({ ...base, superAdminCount: 1, target: self, nextRole: "super_admin" })).toBeNull();
  });
});

describe("checkUserEmailChange", () => {
  const member = { email: "jo@example.com", accountType: "member", staffRole: null };
  const superAdmin = { email: "sam@lotttechnologies.com", accountType: "platform_admin", staffRole: "super_admin" };

  test("company staff can change a member's email", () => {
    expect(
      checkUserEmailChange({ actorEmail: "frank@lotttechnologies.com", target: member, nextEmail: "jo@new.com" }),
    ).toBeNull();
  });

  test("outside staff can't change anyone's email", () => {
    expect(checkUserEmailChange({ actorEmail: "help@gmail.com", target: member, nextEmail: "help@gmail.com" })).toBe(
      "EMAIL_CHANGE_COMPANY_ONLY",
    );
  });

  test("outside staff can still save the same email back", () => {
    expect(checkUserEmailChange({ actorEmail: "help@gmail.com", target: member, nextEmail: " Jo@Example.com" })).toBeNull();
  });

  test("a Super Admin's email stays on the company domain", () => {
    expect(
      checkUserEmailChange({ actorEmail: "frank@lotttechnologies.com", target: superAdmin, nextEmail: "sam@gmail.com" }),
    ).toBe("SUPER_ADMIN_EMAIL_DOMAIN");
  });
});
