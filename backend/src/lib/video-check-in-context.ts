import type { PrismaClient } from "@prisma/client";
import { canMessage } from "./messaging-permission";
import { WORKSPACE_MANAGER_ROLES } from "./workspace-role-policy";

export type VideoRoomKind = "calendar" | "dm" | "group" | "team";

export type VideoCheckInEligiblePair = {
  workspace: { id: string; name: string };
  member: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type VideoCheckInContext = {
  sourceVideoRoomId: string;
  roomKind: VideoRoomKind;
  calendarEventId: string | null;
  eligiblePairs: VideoCheckInEligiblePair[];
};

export class VideoRoomAccessError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 = 403,
  ) {
    super(message);
    this.name = "VideoRoomAccessError";
  }
}

export function parseVideoMeetingParticipantIds(
  raw: string | null | undefined,
): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return [];
    if (!parsed || typeof parsed !== "object") return [];
    const values = (parsed as { assigneeIds?: unknown }).assigneeIds;
    return Array.isArray(values)
      ? [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))]
      : [];
  } catch {
    return [];
  }
}

async function teamParticipantIds(prisma: PrismaClient, teamId: string): Promise<string[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

async function resolveRoom(
  prisma: PrismaClient,
  callerUserId: string,
  roomId: string,
): Promise<{
  kind: VideoRoomKind;
  calendarEventId: string | null;
  participantUserIds: string[];
}> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      teamId: true,
      isVideoMeeting: true,
      reminderMinutes: true,
    },
  });
  if (event) {
    const callerMembership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: callerUserId, teamId: event.teamId } },
      select: { userId: true },
    });
    if (!callerMembership) throw new VideoRoomAccessError("Not a team member");

    const invitedUserIds = parseVideoMeetingParticipantIds(event.reminderMinutes);
    if (invitedUserIds.length > 0 && !invitedUserIds.includes(callerUserId)) {
      throw new VideoRoomAccessError("Not invited to this meeting");
    }
    return {
      kind: "calendar",
      calendarEventId: event.id,
      participantUserIds:
        invitedUserIds.length > 0
          ? invitedUserIds
          : await teamParticipantIds(prisma, event.teamId),
    };
  }

  const conversationParticipant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId: roomId, userId: callerUserId },
    },
    include: {
      conversation: {
        select: {
          isGroup: true,
          participants: { select: { userId: true } },
        },
      },
    },
  });
  if (conversationParticipant) {
    const participantUserIds =
      conversationParticipant.conversation.participants.map((participant) => participant.userId);
    if (!conversationParticipant.conversation.isGroup) {
      const otherUserId = participantUserIds.find((userId) => userId !== callerUserId);
      if (otherUserId && !(await canMessage(callerUserId, otherUserId)).allowed) {
        throw new VideoRoomAccessError(
          "Video calling is unavailable for this conversation",
        );
      }
    }
    return {
      kind: conversationParticipant.conversation.isGroup ? "group" : "dm",
      calendarEventId: null,
      participantUserIds,
    };
  }

  const callerMemberships = await prisma.teamMember.findMany({
    where: { userId: callerUserId },
    select: { teamId: true },
  });
  const teamId =
    callerMemberships.find((membership) => membership.teamId === roomId)?.teamId ??
    callerMemberships.find((membership) =>
      roomId.startsWith(`chat-${membership.teamId}-`),
    )?.teamId;
  if (!teamId) throw new VideoRoomAccessError("Not allowed to join this room");

  return {
    kind: "team",
    calendarEventId: null,
    participantUserIds: await teamParticipantIds(prisma, teamId),
  };
}

export async function resolveVideoCheckInContext(
  prisma: PrismaClient,
  callerUserId: string,
  roomId: string,
): Promise<VideoCheckInContext> {
  const room = await resolveRoom(prisma, callerUserId, roomId);
  const participantUserIds = [
    ...new Set(room.participantUserIds.filter((userId) => userId !== callerUserId)),
  ];

  if (participantUserIds.length === 0) {
    return {
      sourceVideoRoomId: roomId,
      roomKind: room.kind,
      calendarEventId: room.calendarEventId,
      eligiblePairs: [],
    };
  }

  const managerMemberships = await prisma.teamMember.findMany({
    where: {
      userId: callerUserId,
      role: { in: [...WORKSPACE_MANAGER_ROLES] },
    },
    select: { teamId: true },
  });
  const managerTeamIds = managerMemberships.map((membership) => membership.teamId);
  if (managerTeamIds.length === 0) {
    return {
      sourceVideoRoomId: roomId,
      roomKind: room.kind,
      calendarEventId: room.calendarEventId,
      eligiblePairs: [],
    };
  }

  const eligibleMemberships = await prisma.teamMember.findMany({
    where: {
      teamId: { in: managerTeamIds },
      userId: { in: participantUserIds },
    },
    select: {
      team: { select: { id: true, name: true } },
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: [{ team: { name: "asc" } }, { user: { name: "asc" } }],
  });

  return {
    sourceVideoRoomId: roomId,
    roomKind: room.kind,
    calendarEventId: room.calendarEventId,
    eligiblePairs: eligibleMemberships.map((membership) => ({
      workspace: membership.team,
      member: membership.user,
    })),
  };
}

export function contextIncludesCheckInSelection(
  context: VideoCheckInContext,
  teamId: string,
  memberUserId: string,
): boolean {
  return context.eligiblePairs.some(
    (pair) =>
      pair.workspace.id === teamId &&
      pair.member.id === memberUserId,
  );
}
