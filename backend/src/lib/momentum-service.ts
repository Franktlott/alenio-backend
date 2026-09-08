import { Prisma, type PrismaClient } from "@prisma/client";
import { projectMomentum, type MomentumProjection } from "./momentum-projection";

type MomentumDb = Prisma.TransactionClient;

export type MomentumLifecycleResult = {
  creditedUserIds: string[];
  creditIds: string[];
  projections: Record<string, MomentumProjection>;
  milestoneCount: number | null;
  personalBestCount: number | null;
};

const EMPTY_RESULT: MomentumLifecycleResult = {
  creditedUserIds: [],
  creditIds: [],
  projections: {},
  milestoneCount: null,
  personalBestCount: null,
};

export function eligibleMomentumUserIds(input: {
  dueAt: Date | null;
  actorUserId: string;
  isJoint: boolean;
  assignedUserIds: readonly string[];
  subtaskCompletionUserIds: readonly (readonly string[])[];
}): string[] {
  if (!input.dueAt) return [];
  const assigned = [...new Set(input.assignedUserIds)];
  if (!input.isJoint) {
    return assigned.includes(input.actorUserId) ? [input.actorUserId] : [];
  }
  if (input.subtaskCompletionUserIds.length === 0) {
    return assigned.includes(input.actorUserId) ? [input.actorUserId] : [];
  }
  return assigned.filter((userId) =>
    input.subtaskCompletionUserIds.every((completionUserIds) =>
      completionUserIds.includes(userId),
    ),
  );
}

function isMilestone(value: number): boolean {
  return value === 5 || value === 10 || value === 15 || (value >= 20 && value % 10 === 0);
}

async function refreshProjections(
  db: MomentumDb,
  teamId: string,
  userIds: readonly string[],
  actorUserId?: string,
  changedUserIds: ReadonlySet<string> = new Set(),
): Promise<Pick<MomentumLifecycleResult, "projections" | "milestoneCount" | "personalBestCount">> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) {
    return { projections: {}, milestoneCount: null, personalBestCount: null };
  }

  const [credits, members] = await Promise.all([
    db.momentumCompletionCredit.findMany({
      where: { teamId, creditedUserId: { in: uniqueUserIds }, revokedAt: null },
      select: { id: true, creditedUserId: true, completedAt: true, onTime: true },
    }),
    db.teamMember.findMany({
      where: { teamId, userId: { in: uniqueUserIds } },
      select: {
        userId: true,
        currentStreak: true,
        personalBestStreak: true,
        personalBestCelebrated: true,
      },
    }),
  ]);

  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const projections: Record<string, MomentumProjection> = {};
  let milestoneCount: number | null = null;
  let personalBestCount: number | null = null;

  for (const userId of uniqueUserIds) {
    const member = memberByUserId.get(userId);
    if (!member) continue;
    const userCredits = credits.filter((credit) => credit.creditedUserId === userId);
    const projection = projectMomentum(userCredits);
    projections[userId] = projection;

    const changed = changedUserIds.has(userId);
    const hasLateHistory = userCredits.some((credit) => !credit.onTime);
    const crossedExistingBest =
      changed &&
      member.personalBestStreak > 0 &&
      projection.currentStreak > member.personalBestStreak &&
      hasLateHistory &&
      !member.personalBestCelebrated;
    const personalBestCelebrated =
      projection.currentStreak === 0
        ? false
        : crossedExistingBest
          ? true
          : member.personalBestCelebrated;

    await db.teamMember.update({
      where: { userId_teamId: { userId, teamId } },
      data: { ...projection, personalBestCelebrated },
    });

    if (userId === actorUserId && changed) {
      if (isMilestone(projection.currentStreak)) milestoneCount = projection.currentStreak;
      if (crossedExistingBest) personalBestCount = projection.currentStreak;
    }
  }

  return { projections, milestoneCount, personalBestCount };
}

/**
 * Upserts credit for a completed task and refreshes all affected projections.
 * Call inside the same transaction that changes Task.status/completedAt.
 */
export async function applyMomentumCompletion(
  db: MomentumDb,
  input: { taskId: string; actorUserId: string; completedAt: Date },
): Promise<MomentumLifecycleResult> {
  const task = await db.task.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      teamId: true,
      title: true,
      incognito: true,
      isJoint: true,
      dueDate: true,
      kind: true,
      momentumEligible: true,
      assignments: { select: { userId: true } },
      subtasks: {
        select: { completions: { select: { userId: true } } },
      },
    },
  });
  if (!task) throw new Error(`Task ${input.taskId} not found`);
  if (task.kind !== "workspace_task" || !task.momentumEligible) return EMPTY_RESULT;

  const existing = await db.momentumCompletionCredit.findMany({
    where: { teamId: task.teamId, sourceTaskId: task.id },
    select: { id: true, creditedUserId: true, revokedAt: true },
  });
  const existingByUserId = new Map(existing.map((credit) => [credit.creditedUserId, credit]));

  const candidateUserIds = eligibleMomentumUserIds({
    dueAt: task.dueDate,
    actorUserId: input.actorUserId,
    isJoint: task.isJoint,
    assignedUserIds: task.assignments.map((assignment) => assignment.userId),
    subtaskCompletionUserIds: task.subtasks.map((subtask) =>
      subtask.completions.map((completion) => completion.userId),
    ),
  });
  const eligibleMembers = candidateUserIds.length
    ? await db.teamMember.findMany({
        where: { teamId: task.teamId, userId: { in: candidateUserIds } },
        select: { id: true, userId: true },
      })
    : [];
  const memberIdByUserId = new Map(
    eligibleMembers.map((member) => [member.userId, member.id]),
  );
  const eligibleUserIds = candidateUserIds.filter((userId) =>
    memberIdByUserId.has(userId),
  );

  const eligible = new Set(eligibleUserIds);
  const changedUserIds = new Set<string>();
  const creditIds: string[] = [];

  for (const userId of eligibleUserIds) {
    const prior = existingByUserId.get(userId);
    if (prior && !prior.revokedAt) {
      creditIds.push(prior.id);
      continue;
    }
    const credit = await db.momentumCompletionCredit.upsert({
      where: {
        teamId_sourceTaskId_creditedUserId: {
          teamId: task.teamId,
          sourceTaskId: task.id,
          creditedUserId: userId,
        },
      },
      create: {
        teamId: task.teamId,
        sourceTaskId: task.id,
        creditedUserId: userId,
        creditedTeamMemberId: memberIdByUserId.get(userId),
        sourceTaskTitle: task.title,
        sourceTaskIncognito: task.incognito,
        dueAt: task.dueDate!,
        completedAt: input.completedAt,
        onTime: input.completedAt <= task.dueDate!,
      },
      update: {
        creditedTeamMemberId: memberIdByUserId.get(userId),
        sourceTaskTitle: task.title,
        sourceTaskIncognito: task.incognito,
        dueAt: task.dueDate!,
        completedAt: input.completedAt,
        onTime: input.completedAt <= task.dueDate!,
        revokedAt: null,
        revocationReason: null,
      },
      select: { id: true },
    });
    creditIds.push(credit.id);
    changedUserIds.add(userId);
  }

  const staleActiveUserIds = existing
    .filter((credit) => !credit.revokedAt && !eligible.has(credit.creditedUserId))
    .map((credit) => credit.creditedUserId);
  if (staleActiveUserIds.length > 0) {
    await db.momentumCompletionCredit.updateMany({
      where: {
        teamId: task.teamId,
        sourceTaskId: task.id,
        creditedUserId: { in: staleActiveUserIds },
        revokedAt: null,
      },
      data: { revokedAt: input.completedAt, revocationReason: "completion_ineligible" },
    });
    staleActiveUserIds.forEach((userId) => changedUserIds.add(userId));
  }

  const affectedUserIds = [...new Set([...eligibleUserIds, ...staleActiveUserIds])];
  const projectionResult = await refreshProjections(
    db,
    task.teamId,
    affectedUserIds,
    input.actorUserId,
    changedUserIds,
  );

  return {
    creditedUserIds: eligibleUserIds,
    creditIds,
    ...projectionResult,
  };
}

/** Revokes every active credit for the recalled task and reprojects its owners. */
export async function revokeMomentumCompletion(
  db: MomentumDb,
  input: { taskId: string; revokedAt: Date; reason?: string },
): Promise<MomentumLifecycleResult> {
  const task = await db.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, teamId: true, kind: true, momentumEligible: true },
  });
  if (!task) throw new Error(`Task ${input.taskId} not found`);
  if (task.kind !== "workspace_task" || !task.momentumEligible) return EMPTY_RESULT;

  const active = await db.momentumCompletionCredit.findMany({
    where: { teamId: task.teamId, sourceTaskId: task.id, revokedAt: null },
    select: { id: true, creditedUserId: true },
  });
  if (active.length === 0) return EMPTY_RESULT;

  await db.momentumCompletionCredit.updateMany({
    where: { id: { in: active.map((credit) => credit.id) }, revokedAt: null },
    data: {
      revokedAt: input.revokedAt,
      revocationReason: input.reason ?? "task_recalled",
    },
  });

  const affectedUserIds = [...new Set(active.map((credit) => credit.creditedUserId))];
  const projectionResult = await refreshProjections(
    db,
    task.teamId,
    affectedUserIds,
    undefined,
    new Set(affectedUserIds),
  );
  return {
    creditedUserIds: [],
    creditIds: active.map((credit) => credit.id),
    ...projectionResult,
  };
}

export async function withSerializableMomentumTransaction<T>(
  client: PrismaClient,
  operation: (db: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt >= maxAttempts ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      ) {
        throw error;
      }
    }
  }
}
