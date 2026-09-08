export const WORKSPACE_MEMBER_ASSIGNABLE_ROLES = ["member", "team_leader"] as const;
export type WorkspaceMemberAssignableRole = (typeof WORKSPACE_MEMBER_ASSIGNABLE_ROLES)[number];

export type WorkspaceMemberPolicyError = {
  message: string;
  code: "BAD_REQUEST" | "FORBIDDEN" | "TRANSFER_PENDING_RECIPIENT";
  status: 400 | 403 | 409;
};

export function validateWorkspaceRoleChange(input: {
  actorUserId: string;
  actorRole: string | null | undefined;
  targetUserId: string;
  targetRole: string;
}): WorkspaceMemberPolicyError | null {
  if (input.actorRole !== "owner") {
    return { message: "Only owners can change roles", code: "FORBIDDEN", status: 403 };
  }
  if (input.targetUserId === input.actorUserId) {
    return { message: "You cannot change your own role", code: "BAD_REQUEST", status: 400 };
  }
  if (!WORKSPACE_MEMBER_ASSIGNABLE_ROLES.includes(input.targetRole as WorkspaceMemberAssignableRole)) {
    return {
      message: "Only members and team leaders can have their roles changed",
      code: "FORBIDDEN",
      status: 403,
    };
  }
  return null;
}

export function validateWorkspaceMemberRemoval(input: {
  actorUserId: string;
  actorRole: string | null | undefined;
  targetUserId: string;
  targetRole: string;
  isPendingOwnershipRecipient?: boolean;
}): WorkspaceMemberPolicyError | null {
  if (input.actorRole !== "owner" && input.actorRole !== "team_leader") {
    return {
      message: "Only owners and team leaders can remove members",
      code: "FORBIDDEN",
      status: 403,
    };
  }
  if (input.targetUserId === input.actorUserId) {
    return { message: "You cannot remove yourself", code: "BAD_REQUEST", status: 400 };
  }
  if (input.targetRole === "owner" || input.targetRole === "team_leader") {
    return { message: "Cannot remove an owner or team leader", code: "FORBIDDEN", status: 403 };
  }
  if (input.actorRole === "team_leader" && input.targetRole !== "member") {
    return {
      message: "Team leaders can only remove standard members",
      code: "FORBIDDEN",
      status: 403,
    };
  }
  if (input.isPendingOwnershipRecipient) {
    return {
      message: "Cancel the pending ownership transfer before removing this member.",
      code: "TRANSFER_PENDING_RECIPIENT",
      status: 409,
    };
  }
  return null;
}
