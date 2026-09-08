import type { Prisma, PrismaClient } from "@prisma/client";
import { ONEONE_FEEDBACK_MARKER, parseFeedbackTaskDescription } from "./one-on-one-feedback";
import { canManageWorkspaceRoster } from "./workspace-role-policy";

export function canManageTeamRoster(role: string): boolean {
  return canManageWorkspaceRoster(role);
}

export const DEVELOPMENT_GOAL_ARCHIVE_REASON_MEMBER_DEPARTURE = "member_departure";

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

export async function hasArchivedMemberRecords(
  db: PrismaClient,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const [publishedCheckIn, archivedGoal] = await Promise.all([
    db.oneOnOneMeeting.findFirst({
      where: { teamId, memberUserId: userId, status: "published" },
      select: { id: true },
    }),
    db.developmentGoal.findFirst({
      where: { teamId, memberUserId: userId, archivedAt: { not: null } },
      select: { id: true },
    }),
  ]);
  return !!publishedCheckIn || !!archivedGoal;
}

async function archiveDepartedMemberDevelopmentGoals(
  db: PrismaClient | Prisma.TransactionClient,
  teamId: string,
  userId: string,
  archivedAt: Date,
): Promise<number> {
  const result = await db.developmentGoal.updateMany({
    where: { teamId, memberUserId: userId, archivedAt: null },
    data: {
      archivedAt,
      archiveReason: DEVELOPMENT_GOAL_ARCHIVE_REASON_MEMBER_DEPARTURE,
    },
  });
  return result.count;
}

export async function cleanupWorkspaceMemberDeparture(
  db: PrismaClient | Prisma.TransactionClient,
  teamId: string,
  userId: string,
  now = new Date(),
): Promise<{ deletedDraftCheckIns: number; archivedDevelopmentGoals: number; closedTasks: number }> {
  const [draftResult, archivedDevelopmentGoals] = await Promise.all([
    db.oneOnOneMeeting.deleteMany({
      where: { teamId, memberUserId: userId, status: "draft" },
    }),
    archiveDepartedMemberDevelopmentGoals(db, teamId, userId, now),
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
    // Administrative closure is not a user completion and must bypass Momentum credit.
    const result = await db.task.updateMany({
      where: { id: { in: taskIdsToClose } },
      data: { status: "done", completedAt: now },
    });
    closedTasks = result.count;
  }

  return {
    deletedDraftCheckIns: draftResult.count,
    archivedDevelopmentGoals,
    closedTasks,
  };
}

export async function cleanupWorkspaceMembersDeparture(
  db: PrismaClient | Prisma.TransactionClient,
  teamId: string,
  userIds: readonly string[],
  now = new Date(),
): Promise<void> {
  for (const userId of userIds) {
    await cleanupWorkspaceMemberDeparture(db, teamId, userId, now);
  }
}

export type FormerWorkspaceMember = {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isWorkplaceConnected: boolean;
  };
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

  const [checkInMembers, goalMembers] = await Promise.all([
    db.oneOnOneMeeting.groupBy({
      by: ["memberUserId"],
      where: { teamId, status: "published" },
    }),
    db.developmentGoal.groupBy({
      by: ["memberUserId"],
      where: { teamId, archivedAt: { not: null } },
    }),
  ]);

  const formerIds = [
    ...new Set(
      [...checkInMembers, ...goalMembers]
        .map((row) => row.memberUserId)
        .filter((userId) => !currentIds.has(userId)),
    ),
  ];

  if (formerIds.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: formerIds } },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      _count: { select: { teamMembers: true } },
    },
  });
  const userById = new Map(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        isWorkplaceConnected: user._count.teamMembers > 0,
      },
    ]),
  );

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
