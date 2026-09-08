import { describe, expect, test } from "bun:test";
import {
  canInviteWorkspaceRole,
  formatInviteRole,
  isTeamInviteRole,
  normalizeTeamInviteRole,
  serializeTeamInvite,
} from "./team-invites";

describe("formatInviteRole", () => {
  test("does not present legacy workspace admin as a team leader", () => {
    expect(formatInviteRole("owner")).toBe("Owner");
    expect(formatInviteRole("team_leader")).toBe("Team Leader");
    expect(formatInviteRole("admin")).toBe("Member");
    expect(formatInviteRole("member")).toBe("Member");
  });
});

describe("workspace invite roles", () => {
  test("accepts only member and team leader invite roles", () => {
    expect(isTeamInviteRole("member")).toBe(true);
    expect(isTeamInviteRole("team_leader")).toBe(true);
    expect(isTeamInviteRole("owner")).toBe(false);
    expect(isTeamInviteRole("admin")).toBe(false);
    expect(isTeamInviteRole(undefined)).toBe(false);
  });

  test("allows only owners to invite team leaders", () => {
    expect(canInviteWorkspaceRole("owner", "team_leader")).toBe(true);
    expect(canInviteWorkspaceRole("team_leader", "team_leader")).toBe(false);
    expect(canInviteWorkspaceRole("admin", "team_leader")).toBe(false);
  });

  test("allows current roster managers to invite members", () => {
    expect(canInviteWorkspaceRole("owner", "member")).toBe(true);
    expect(canInviteWorkspaceRole("team_leader", "member")).toBe(true);
    expect(canInviteWorkspaceRole("admin", "member")).toBe(false);
    expect(canInviteWorkspaceRole("member", "member")).toBe(false);
  });

  test("normalizes unsupported stored roles before redemption", () => {
    expect(normalizeTeamInviteRole("team_leader")).toBe("team_leader");
    expect(normalizeTeamInviteRole("member")).toBe("member");
    expect(normalizeTeamInviteRole("owner")).toBe("member");
    expect(normalizeTeamInviteRole("admin")).toBe("member");
  });

  test("serializes the persisted invite role for list and resend responses", () => {
    const createdAt = new Date("2026-08-20T10:00:00.000Z");
    const expiresAt = new Date("2026-08-27T10:00:00.000Z");
    expect(serializeTeamInvite({
      id: "invite-1",
      teamId: "team-1",
      email: "leader@example.com",
      role: "team_leader",
      invitedById: "owner-1",
      token: "token",
      status: "pending",
      acceptedUserId: null,
      createdAt,
      expiresAt,
      acceptedAt: null,
    })).toMatchObject({
      id: "invite-1",
      role: "team_leader",
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  });
});
