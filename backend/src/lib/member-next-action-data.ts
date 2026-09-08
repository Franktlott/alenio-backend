import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import {
  evaluateMemberNextAction,
  type MemberNextActionFacts,
} from "./member-next-action-engine";
import { parseWorkplaceStandards, frequencyToDays } from "./workplace-standards";
import { addCalendarDaysInTimeZone, resolveTimeZone } from "./timezone";
import {
  canManageCheckIns,
  canManageMemberNextActions,
} from "./workspace-role-policy";

export class MemberNextActionAccessError extends Error {
  constructor(
    readonly status: 403 | 404,
    readonly code: "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export function canInspectMemberNextAction(
  currentMembership: { userId: string; role: string },
  memberUserId: string,
): boolean {
  return (
    currentMembership.userId === memberUserId ||
    canManageMemberNextActions(currentMembership.role)
  );
}

export async function loadMemberNextActionFacts(
  teamId: string,
  memberUserId: string,
  currentUserId: string,
  now = new Date(),
  db: PrismaClient = prisma,
): Promise<MemberNextActionFacts> {
  const currentMembership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: currentUserId, teamId } },
    select: {
      userId: true,
      role: true,
      user: { select: { timezone: true } },
      team: { select: { workplaceStandards: true } },
    },
  });

  if (!currentMembership) {
    throw new MemberNextActionAccessError(
      403,
      "FORBIDDEN",
      "You are not a member of this workspace.",
    );
  }
  if (!canInspectMemberNextAction(currentMembership, memberUserId)) {
    throw new MemberNextActionAccessError(
      403,
      "FORBIDDEN",
      "You do not have permission to inspect this team member.",
    );
  }
  const targetMembership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
    select: { userId: true, user: { select: { timezone: true } } },
  });
  if (!targetMembership) {
    throw new MemberNextActionAccessError(
      404,
      "NOT_FOUND",
      "Team member not found.",
    );
  }

  const standards = parseWorkplaceStandards(
    currentMembership.team.workplaceStandards,
  );
  const requiredTemplateId = standards.requiredCheckInTemplateId;
  const timeZone = resolveTimeZone(
    currentMembership.user.timezone ?? targetMembership.user.timezone,
  );

  const [
    completedCheckInRows,
    futureCheckInEvents,
    activeDevelopmentGoals,
    activeAssignedTasks,
    requiredTemplate,
  ] = await Promise.all([
    db.oneOnOneMeeting.findMany({
      where: {
        teamId,
        memberUserId,
        status: "published",
        ...(requiredTemplateId ? { templateId: requiredTemplateId } : {}),
      },
      select: { id: true, publishedAt: true, createdAt: true },
    }),
    db.calendarEvent.findMany({
      where: {
        teamId,
        isOneOnOne: true,
        oneOnOneMemberUserId: memberUserId,
        startDate: { gt: now },
        approvalStatus: { in: ["approved", "pending"] },
      },
      select: { id: true },
    }),
    db.developmentGoal.findMany({
      where: { teamId, memberUserId, status: "active", archivedAt: null },
      select: { id: true, createdAt: true, lastActivityAt: true },
    }),
    db.task.findMany({
      where: {
        teamId,
        kind: "workspace_task",
        status: { not: "done" },
        archivedAt: null,
        assignments: { some: { userId: memberUserId } },
      },
      select: { id: true, dueDate: true },
    }),
    requiredTemplateId
      ? db.oneOnOneTemplate.findFirst({
          where: { id: requiredTemplateId, teamId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const completedCheckIns = completedCheckInRows
    .map((meeting) => ({
      id: meeting.id,
      completedAt: meeting.publishedAt ?? meeting.createdAt,
    }))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  const latestCompletedAt = completedCheckIns[0]?.completedAt ?? null;
  const frequencyDays = frequencyToDays(
    standards.checkInFrequencyValue,
    standards.checkInFrequencyUnit,
  );

  return {
    teamId,
    memberUserId,
    timeZone,
    checkInActionsAvailable:
      standards.checkInRequired &&
      (!requiredTemplateId || requiredTemplate?.id === requiredTemplateId),
    developmentGoalActionsAvailable: standards.goalsRequired,
    canScheduleCheckIn: canManageCheckIns(currentMembership.role),
    completedCheckIns,
    nextRequiredCheckInAt: latestCompletedAt
      ? addCalendarDaysInTimeZone(latestCompletedAt, frequencyDays, timeZone)
      : null,
    futureCheckInEventIds: futureCheckInEvents.map((event) => event.id),
    activeDevelopmentGoals,
    activeAssignedTasks: activeAssignedTasks.map((task) => ({
      id: task.id,
      dueAt: task.dueDate,
    })),
  };
}

export async function getMemberNextAction(
  teamId: string,
  memberUserId: string,
  currentUserId: string,
  now = new Date(),
  db: PrismaClient = prisma,
) {
  const facts = await loadMemberNextActionFacts(
    teamId,
    memberUserId,
    currentUserId,
    now,
    db,
  );
  return evaluateMemberNextAction(facts, now);
}
