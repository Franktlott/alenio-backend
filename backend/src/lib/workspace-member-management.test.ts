import { describe, expect, test } from "bun:test";
import {
  validateWorkspaceMemberRemoval,
  validateWorkspaceRoleChange,
} from "./workspace-member-management";

describe("workspace member management policy", () => {
  test("restricts role changes to owners and editable roles", () => {
    expect(validateWorkspaceRoleChange({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "member",
      targetRole: "member",
    })).toBeNull();
    expect(validateWorkspaceRoleChange({
      actorUserId: "leader",
      actorRole: "team_leader",
      targetUserId: "member",
      targetRole: "member",
    })?.code).toBe("FORBIDDEN");
    expect(validateWorkspaceRoleChange({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "legacy-admin",
      targetRole: "admin",
    })?.code).toBe("FORBIDDEN");
    expect(validateWorkspaceRoleChange({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "other-owner",
      targetRole: "owner",
    })?.code).toBe("FORBIDDEN");
  });

  test("prevents self-removal and protects managers", () => {
    expect(validateWorkspaceMemberRemoval({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "owner",
      targetRole: "owner",
    })?.code).toBe("BAD_REQUEST");
    expect(validateWorkspaceMemberRemoval({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "leader",
      targetRole: "team_leader",
    })?.code).toBe("FORBIDDEN");
  });

  test("team leaders can remove only standard members", () => {
    expect(validateWorkspaceMemberRemoval({
      actorUserId: "leader",
      actorRole: "team_leader",
      targetUserId: "member",
      targetRole: "member",
    })).toBeNull();
    expect(validateWorkspaceMemberRemoval({
      actorUserId: "leader",
      actorRole: "team_leader",
      targetUserId: "legacy-admin",
      targetRole: "admin",
    })?.code).toBe("FORBIDDEN");
  });

  test("blocks pending ownership recipients before removal", () => {
    expect(validateWorkspaceMemberRemoval({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "member",
      targetRole: "member",
      isPendingOwnershipRecipient: true,
    })).toMatchObject({
      code: "TRANSFER_PENDING_RECIPIENT",
      status: 409,
    });
  });
});
