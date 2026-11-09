import { describe, expect, test } from "bun:test";
import { audienceUserWhere, reachableUserWhere } from "./push-campaign-audience";

const NOT_STAFF = { accountType: { not: "platform_admin" } };

describe("push campaign audiences", () => {
  test("all users excludes staff logins", () => {
    expect(audienceUserWhere({ kind: "all" })).toEqual(NOT_STAFF);
  });

  test("workspace audience needs a workspace", () => {
    expect(audienceUserWhere({ kind: "workspace" })).toBeNull();
    expect(audienceUserWhere({ kind: "workspace", teamId: "t1" })).toEqual({
      ...NOT_STAFF,
      teamMembers: { some: { teamId: "t1" } },
    });
  });

  test("paid and trial audiences read the team subscription", () => {
    expect(audienceUserWhere({ kind: "paid" })).toEqual({
      ...NOT_STAFF,
      teamMembers: { some: { team: { subscription: { is: { status: { in: ["active", "past_due"] }, plan: { not: "free" } } } } } },
    });
    expect(audienceUserWhere({ kind: "trial" })).toEqual({
      ...NOT_STAFF,
      teamMembers: { some: { team: { subscription: { is: { status: "trialing" } } } } },
    });
  });

  test("reachable adds a device token and respects the announcements opt-out", () => {
    expect(reachableUserWhere({ kind: "all" })).toEqual({
      ...NOT_STAFF,
      pushToken: { not: null },
      notifProductUpdates: true,
    });
    expect(reachableUserWhere({ kind: "workspace" })).toBeNull();
  });
});
