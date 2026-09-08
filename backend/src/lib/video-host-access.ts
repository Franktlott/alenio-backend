import type { PrismaClient } from "@prisma/client";
import { WORKSPACE_MANAGER_ROLES } from "./workspace-role-policy";

export function buildDailyParticipantEjectBody(
  sessionId: string,
  userId?: string | null,
) {
  return {
    ids: [sessionId],
    ...(userId ? { user_ids: [userId], ban: true } : { ban: false }),
  };
}

export async function isUserVideoRoomHost(
  prisma: PrismaClient,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: roomId },
    select: { createdById: true, teamId: true },
  });
  if (event) {
    if (event.createdById === userId) return true;
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: event.teamId } },
      select: { role: true },
    });
    return (
      !!membership &&
      WORKSPACE_MANAGER_ROLES.includes(
        membership.role as (typeof WORKSPACE_MANAGER_ROLES)[number],
      )
    );
  }

  const conversationParticipant =
    await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: roomId, userId } },
      select: {
        role: true,
        conversation: { select: { teamId: true } },
      },
    });
  if (conversationParticipant) {
    if (
      conversationParticipant.role === "owner" ||
      conversationParticipant.role === "admin"
    ) {
      return true;
    }
    const teamId = conversationParticipant.conversation.teamId;
    if (!teamId) return false;
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { role: true },
    });
    return (
      !!membership &&
      WORKSPACE_MANAGER_ROLES.includes(
        membership.role as (typeof WORKSPACE_MANAGER_ROLES)[number],
      )
    );
  }

  const managerMemberships = await prisma.teamMember.findMany({
    where: {
      userId,
      role: { in: [...WORKSPACE_MANAGER_ROLES] },
    },
    select: { teamId: true },
  });
  return managerMemberships.some(
    ({ teamId }) => roomId === teamId || roomId.startsWith(`chat-${teamId}-`),
  );
}
