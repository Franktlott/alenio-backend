import { parseCalendarAssignees } from "./calendar-assignees";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../prisma";

export async function loadWorkspaceMembership(
  userId: string,
  workspaceId: string,
  db: PrismaClient = prisma,
): Promise<{ role: string; organizationId: string | null } | null> {
  const membership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: workspaceId } },
    select: {
      role: true,
      team: { select: { organizationId: true } },
    },
  });
  if (!membership) return null;
  return {
    role: membership.role,
    organizationId: membership.team?.organizationId ?? null,
  };
}

export async function loadTaskAuthzRecord(id: string, db: PrismaClient = prisma) {
  return db.task.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      kind: true,
      creatorId: true,
      assignments: { select: { userId: true } },
    },
  });
}

export async function loadEventAuthzRecord(id: string, db: PrismaClient = prisma) {
  const event = await db.calendarEvent.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      isHidden: true,
      approvalStatus: true,
      createdById: true,
      isVideoMeeting: true,
      isOneOnOne: true,
      oneOnOneMemberUserId: true,
      reminderMinutes: true,
    },
  });
  if (!event) return null;
  const assigneeIds = [
    ...parseCalendarAssignees(event.reminderMinutes),
    ...(event.oneOnOneMemberUserId ? [event.oneOnOneMemberUserId] : []),
  ];
  return { ...event, assigneeIds };
}

export async function loadGoalAuthzRecord(id: string, db: PrismaClient = prisma) {
  return db.developmentGoal.findUnique({
    where: { id },
    select: { id: true, teamId: true, memberUserId: true, archivedAt: true },
  });
}

export async function loadCheckInAuthzRecord(id: string, db: PrismaClient = prisma) {
  return db.oneOnOneMeeting.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      memberUserId: true,
      status: true,
      createdById: true,
    },
  });
}

export async function loadRecordingAuthzRecord(id: string, db: PrismaClient = prisma) {
  return db.checkInRecording.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      createdById: true,
      audioStatus: true,
      audioExpiresAt: true,
      meetingId: true,
      meeting: {
        select: { id: true, teamId: true, memberUserId: true, status: true },
      },
    },
  });
}

export async function loadConversationAuthzRecord(id: string, db: PrismaClient = prisma) {
  return db.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      participants: { select: { userId: true } },
    },
  });
}
