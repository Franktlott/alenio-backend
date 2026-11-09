import { describe, expect, test } from "bun:test";
import type { TeamMember, TeamRole } from "./types";
import {
  canEditWorkspacePermissionTarget,
  getWorkspaceRolePresentation,
  sortWorkspacePermissionMembers,
} from "./workspace-permissions";

function member(
  userId: string,
  name: string,
  email: string,
  role: TeamRole = "member",
): TeamMember {
  return {
    id: `membership-${userId}`,
    role,
    userId,
    teamId: "team-1",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id: userId, name, email, image: null },
  };
}

describe("workspace permission roles", () => {
  test("presents the three current workspace roles", () => {
    expect(getWorkspaceRolePresentation("owner").label).toBe("Owner");
    expect(getWorkspaceRolePresentation("team_leader").label).toBe(
      "Team Leader",
    );
    expect(getWorkspaceRolePresentation("member").label).toBe("Member");
  });

  test("keeps legacy admins clearly labeled", () => {
    expect(getWorkspaceRolePresentation("admin")).toMatchObject({
      label: "Admin",
      shortLabel: "Admin",
    });
  });
});

describe("canEditWorkspacePermissionTarget", () => {
  test("lets owners edit members and team leaders", () => {
    expect(
      canEditWorkspacePermissionTarget({
        viewerRole: "owner",
        targetRole: "member",
      }),
    ).toBe(true);
    expect(
      canEditWorkspacePermissionTarget({
        viewerRole: "owner",
        targetRole: "team_leader",
      }),
    ).toBe(true);
  });

  test("does not allow owner or legacy admin changes", () => {
    expect(
      canEditWorkspacePermissionTarget({
        viewerRole: "owner",
        targetRole: "owner",
      }),
    ).toBe(false);
    expect(
      canEditWorkspacePermissionTarget({
        viewerRole: "owner",
        targetRole: "admin",
      }),
    ).toBe(false);
  });

  test("keeps team leader role management read-only", () => {
    expect(
      canEditWorkspacePermissionTarget({
        viewerRole: "team_leader",
        targetRole: "member",
      }),
    ).toBe(false);
  });
});

describe("sortWorkspacePermissionMembers", () => {
  test("sorts by name without mutating the source list", () => {
    const source = [
      member("3", "zoe", "zoe@example.com"),
      member("1", "Amy", "amy@example.com"),
      member("2", "ben", "ben@example.com"),
    ];

    expect(
      sortWorkspacePermissionMembers(source).map((entry) => entry.user.name),
    ).toEqual(["Amy", "ben", "zoe"]);
    expect(source.map((entry) => entry.user.name)).toEqual([
      "zoe",
      "Amy",
      "ben",
    ]);
  });

  test("falls back to email when a member has no display name", () => {
    const source = [
      member("2", "", "zoe@example.com"),
      member("1", "", "amy@example.com"),
    ];

    expect(
      sortWorkspacePermissionMembers(source).map((entry) => entry.user.email),
    ).toEqual(["amy@example.com", "zoe@example.com"]);
  });
});
