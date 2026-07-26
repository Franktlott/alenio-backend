import type { ConversationParticipantRole } from "@prisma/client";

export type GroupParticipantWithRole = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: ConversationParticipantRole;
};

export function canManageGroupMembers(role: ConversationParticipantRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteGroup(role: ConversationParticipantRole | null | undefined): boolean {
  return role === "owner";
}

export function canTransferGroupOwnership(role: ConversationParticipantRole | null | undefined): boolean {
  return role === "owner";
}

export function canManageGroupAdmins(role: ConversationParticipantRole | null | undefined): boolean {
  return role === "owner";
}

/** Owners can remove admins/members; admins can remove members only. Nobody can remove the owner. */
export function canRemoveGroupParticipant(
  actorRole: ConversationParticipantRole,
  targetRole: ConversationParticipantRole,
): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

export function formatGroupParticipants(
  participants: Array<{
    role: ConversationParticipantRole;
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }>,
): GroupParticipantWithRole[] {
  return participants.map((participant) => ({
    id: participant.user.id,
    name: participant.user.name,
    email: participant.user.email,
    image: participant.user.image,
    role: participant.role,
  }));
}
