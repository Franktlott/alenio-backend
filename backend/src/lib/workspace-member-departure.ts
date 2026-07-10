import type { PrismaClient } from "@prisma/client";
import { ONEONE_FEEDBACK_MARKER, parseFeedbackTaskDescription } from "./one-on-one-feedback";

export function canManageTeamRoster(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export async function isActiveTeamMember(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { userId: true },
  });
  return !!membership;
}

export async function hasArchivedCheckInRecords(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const publishedCheckIn = await db.oneOnOneMeeting.findFirst({
    where: { teamId, memberUserId: userId, status: "published" },
    select: { id: true },
  });
  return !!publishedCheckIn;
}

/** @deprecated Use hasArchivedCheckInRecords — development goals are deleted on departure. */
export async function hasArchivedMemberRecords(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<boolean> {
  return hasArchivedCheckInRecords(db, teamId, userId);
}

async function deleteDepartedMemberDevelopmentGoals(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<number> {
  const result = await db.developmentGoal.deleteMany({
    where: { teamId, memberUserId: userId },
  });
  return result.count;
}

export async function cleanupWorkspaceMemberDeparture(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<{ deletedDraftCheckIns: number; deletedDevelopmentGoals: number; closedTasks: number }> {
  const [draftResult, deletedDevelopmentGoals] = await Promise.all([
    db.oneOnOneMeeting.deleteMany({
      where: { teamId, memberUserId: userId, status: "draft" },
    }),
    deleteDepartedMemberDevelopmentGoals(db, teamId, userId),
  ]);

  const openTasks = await db.task.findMany({
    where: {
      teamId,
      status: { not: "done" },
      assignments: { some: { userId } },
      OR: [
        { oneOnOneMeetingId: { not: null } },
        { description: { contains: ONEONE_FEEDBACK_MARKER } },
      ],
    },
    select: { id: true, description: true, oneOnOneMeetingId: true },
  });

  const taskIdsToClose = openTasks
    .filter((task) => {
      if (task.oneOnOneMeetingId) return true;
      const meta = parseFeedbackTaskDescription(task.description);
      return meta?.memberUserId === userId;
    })
    .map((task) => task.id);

  let closedTasks = 0;
  if (taskIdsToClose.length > 0) {
    const result = await db.task.updateMany({
      where: { id: { in: taskIdsToClose } },
      data: { status: "done", completedAt: new Date() },
    });
    closedTasks = result.count;
  }

  return {
    deletedDraftCheckIns: draftResult.count,
    deletedDevelopmentGoals,
    closedTasks,
  };
}

export type FormerWorkspaceMember = {
  userId: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  isFormer: true;
};

export async function listFormerWorkspaceMembers(
  db: PrismaClient,
  teamId: string,
): Promise<FormerWorkspaceMember[]> {
  const currentMembers = await db.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  const currentIds = new Set(currentMembers.map((member) => member.userId));

  if (currentIds.size > 0) {
    await db.developmentGoal.deleteMany({
      where: {
        teamId,
        memberUserId: { notIn: [...currentIds] },
      },
    });
  }

  const checkInMembers = await db.oneOnOneMeeting.groupBy({
    by: ["memberUserId"],
    where: { teamId, status: "published" },
  });

  const formerIds = checkInMembers
    .map((row) => row.memberUserId)
    .filter((userId) => !currentIds.has(userId));

  if (formerIds.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: formerIds } },
    select: { id: true, name: true, email: true, image: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  return formerIds
    .map((userId): FormerWorkspaceMember | null => {
      const user = userById.get(userId);
      if (!user) return null;
      return { userId, user, isFormer: true as const };
    })
    .filter((row): row is FormerWorkspaceMember => row !== null)
    .sort((a, b) =>
      (a.user.name ?? a.user.email ?? "").localeCompare(b.user.name ?? b.user.email ?? ""),
    );
}
