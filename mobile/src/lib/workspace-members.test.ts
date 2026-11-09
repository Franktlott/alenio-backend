import { describe, expect, test } from "bun:test";
import type { TeamMember, TeamRole } from "./types";
import {
  canBulkManageWorkspaceMember,
  canBulkRemoveWorkspaceMember,
  matchesWorkspaceMemberFilter,
  parseInviteEmails,
  workspaceMemberCounts,
} from "./workspace-members";

function member(userId: string, role: TeamRole): TeamMember {
  return {
    id: `membership-${userId}`,
    role,
    userId,
    teamId: "team-1",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id: userId, name: userId, email: `${userId}@example.com` },
  };
}

describe("workspace member filters", () => {
  const members = [
    member("owner", "owner"),
    member("admin", "admin"),
    member("leader", "team_leader"),
    member("person", "member"),
  ];

  test("counts canonical groups including legacy admins", () => {
    expect(workspaceMemberCounts(members)).toEqual({
      all: 4,
      admins: 2,
      team_leader: 1,
      member: 1,
    });
    expect(members.filter((item) => matchesWorkspaceMemberFilter(item, "admins")))
      .toHaveLength(2);
  });
});

describe("invite email parsing", () => {
  test("splits commas and newlines, normalizes, and removes duplicates", () => {
    expect(parseInviteEmails(" A@Example.com, b@example.com\n a@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });
});

describe("bulk eligibility", () => {
  test("owners can edit members and leaders but never themselves or admins", () => {
    expect(canBulkManageWorkspaceMember("owner", member("person", "member"), "owner")).toBe(true);
    expect(canBulkManageWorkspaceMember("owner", member("leader", "team_leader"), "owner")).toBe(true);
    expect(canBulkManageWorkspaceMember("owner", member("owner", "owner"), "owner")).toBe(false);
    expect(canBulkManageWorkspaceMember("owner", member("admin", "admin"), "owner")).toBe(false);
  });

  test("owners can remove standard members but not leaders", () => {
    expect(canBulkRemoveWorkspaceMember("owner", member("person", "member"), "owner")).toBe(true);
    expect(canBulkRemoveWorkspaceMember("owner", member("leader", "team_leader"), "owner")).toBe(false);
  });

  test("team leaders can only remove standard members", () => {
    expect(canBulkManageWorkspaceMember("team_leader", member("person", "member"), "leader")).toBe(true);
    expect(canBulkManageWorkspaceMember("team_leader", member("other", "team_leader"), "leader")).toBe(false);
    expect(canBulkRemoveWorkspaceMember("team_leader", member("person", "member"), "leader")).toBe(true);
  });
});
