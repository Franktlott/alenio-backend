import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";
import {
  DEVELOPMENT_GOAL_INACTIVITY_DAYS,
  daysSinceGoalActivity,
  daysUntilGoalInactive,
  isDevelopmentGoalNearingInactive,
  normalizeDevelopmentGoalStatus,
  reconcileInactiveDevelopmentGoals,
  type DevelopmentGoalLifecycleStatus,
} from "../lib/development-goal-activity";
import {
  canManageTeamRoster,
  hasArchivedMemberRecords,
  isActiveTeamMember,
} from "../lib/workspace-member-departure";
import {
  canCompleteDevelopmentGoalSteps,
  canManageAssignedDevelopmentGoals,
} from "../lib/workspace-role-policy";
import {
  canCloseDevelopmentGoal,
  developmentGoalProgress,
  isValidGoalStepIndex,
  parseCompletedStepDates,
  remapCompletedStepDates,
  remapCompletedStepIndexes,
  toggleCompletedStepDate,
  toggleCompletedStepIndex,
} from "../lib/development-goal-progress";
import { shouldEmitDevelopmentGoalCompleted } from "../lib/development-goal-activity";
import { publishUserInboxUpdated } from "../lib/realtime-hub";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const developmentGoalsRouter = new Hono<{ Variables: Variables }>();
developmentGoalsRouter.use("*", authGuard);

async function publishTeamGoalsUpdated(teamId: string): Promise<void> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  publishUserInboxUpdated(
    members.map((member) => member.userId),
    { kind: "team", teamId, resource: "goals" },
  );
}

const userSelect = { id: true, name: true, email: true, image: true } as const;

const createGoalSchema = z.object({
  skill: z.string().trim().min(1, "Skill is required").max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  steps: z.array(z.string().trim().min(1).max(500)).min(1, "Add at least one step").max(20),
});

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note is required").max(5000),
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "closed"]),
});

const updateStepCompletionSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  completed: z.boolean(),
});

function normalizeStatus(raw: string | null | undefined): DevelopmentGoalLifecycleStatus {
  return normalizeDevelopmentGoalStatus(raw);
}

async function reconcileInactiveGoals(
  goals: Array<{
    id: string;
    status?: string | null;
    lastActivityAt?: Date | null;
    createdAt: Date;
    notes?: Array<{ createdAt: Date }>;
  }>,
): Promise<Set<string>> {
  return reconcileInactiveDevelopmentGoals(goals, async (ids) => {
    await prisma.developmentGoal.updateMany({
      where: { id: { in: ids } },
      data: { status: "inactive" },
    });
  });
}

function touchActivityData(
  existing: { status?: string | null },
  now = new Date(),
): { lastActivityAt: Date; status?: string } {
  const data: { lastActivityAt: Date; status?: string } = { lastActivityAt: now };
  if (normalizeStatus(existing.status) === "inactive") {
    data.status = "active";
  }
  return data;
}

async function getMembership(
  c: { get: (key: "user" | "session") => unknown },
  teamId: string,
) {
  const user = c.get("user") as { id?: string } | null;
  const session = c.get("session") as { user?: { id?: string } } | null;
  const ids = [...new Set([user?.id, session?.user?.id].filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (const userId of ids) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (membership) return membership;
  }
  return null;
}

function canManageDevelopmentGoal(
  membership: { role: string; userId: string },
  memberUserId: string,
): boolean {
  return canManageAssignedDevelopmentGoals(
    membership.role,
    membership.userId,
    memberUserId,
  );
}

function parseSteps(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function serializeGoal(
  goal: {
  id: string;
  teamId: string;
  memberUserId: string;
  skill: string;
  description?: string | null;
  dueDate?: Date | null;
  priority?: string | null;
  steps: string;
  completedStepIndexes?: string | null;
  completedStepDates?: string | null;
  status?: string | null;
  closedAt?: Date | null;
  archivedAt?: Date | null;
  archiveReason?: string | null;
  lastActivityAt?: Date | null;
  createdById: string;
  createdAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  notes?: Array<{
    id: string;
    body: string;
    createdAt: Date;
    createdById: string;
    createdBy: { id: string; name: string; email: string; image: string | null };
  }>;
},
  now = new Date(),
  forceReadOnly = false,
) {
  const status = normalizeStatus(goal.status);
  const steps = parseSteps(goal.steps);
  const progress = developmentGoalProgress(
    goal.completedStepIndexes,
    steps.length,
  );
  const lastActivityAt = goal.lastActivityAt ?? goal.createdAt;
  const daysSinceActivity = daysSinceGoalActivity(goal, now);
  const daysUntilInactive = daysUntilGoalInactive({ ...goal, status }, now);
  return {
    id: goal.id,
    teamId: goal.teamId,
    memberUserId: goal.memberUserId,
    skill: goal.skill,
    description: goal.description ?? null,
    dueDate: goal.dueDate?.toISOString() ?? null,
    priority: goal.priority ?? "normal",
    steps,
    ...progress,
    completedStepDates: parseCompletedStepDates(goal.completedStepDates),
    status,
    closedAt: goal.closedAt ? goal.closedAt.toISOString() : null,
    archivedAt: goal.archivedAt?.toISOString() ?? null,
    archiveReason: goal.archiveReason ?? null,
    isArchived: !!goal.archivedAt,
    readOnly: forceReadOnly || !!goal.archivedAt,
    lastActivityAt: lastActivityAt.toISOString(),
    daysSinceActivity,
    daysUntilInactive,
    nearingInactive: isDevelopmentGoalNearingInactive({ ...goal, status }, now),
    inactivityPolicyDays: DEVELOPMENT_GOAL_INACTIVITY_DAYS,
    createdById: goal.createdById,
    createdAt: goal.createdAt.toISOString(),
    createdBy: goal.createdBy,
    notes: (goal.notes ?? []).map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      createdById: note.createdById,
      createdBy: note.createdBy,
    })),
  };
}

const goalInclude = {
  createdBy: { select: userSelect },
  notes: {
    orderBy: { createdAt: "asc" as const },
    include: { createdBy: { select: userSelect } },
  },
} as const;

// GET /api/teams/:teamId/members/:memberUserId/development-goals
developmentGoalsRouter.get("/:memberUserId/development-goals", async (c) => {
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const activeMember = await isActiveTeamMember(prisma, teamId, memberUserId);
  const canManage = canManageTeamRoster(membership.role);
  if (
    activeMember &&
    membership.userId !== memberUserId &&
    !canManage
  ) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (
    !activeMember &&
    (!canManage ||
      !(await hasArchivedMemberRecords(prisma, teamId, memberUserId)))
  ) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const goals = await prisma.developmentGoal.findMany({
      where: {
        teamId,
        memberUserId,
        archivedAt: activeMember ? null : { not: null },
      },
      include: goalInclude,
      orderBy: { createdAt: "desc" },
    });
    const inactiveIds = activeMember
      ? await reconcileInactiveGoals(goals)
      : new Set<string>();
    const now = new Date();
    return c.json({
      data: goals.map((goal) =>
        serializeGoal(
          inactiveIds.has(goal.id) ? { ...goal, status: "inactive" } : goal,
          now,
          !canManageDevelopmentGoal(membership, memberUserId) || !activeMember,
        ),
      ),
    });
  } catch (err) {
    return prismaRouteError(c, err, "[development-goals] GET failed");
  }
});

// POST /api/teams/:teamId/members/:memberUserId/development-goals
developmentGoalsRouter.post(
  "/:memberUserId/development-goals",
  zValidator("json", createGoalSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canCreate = canManageDevelopmentGoal(membership, memberUserId);
    if (!canCreate) {
      return c.json({ error: { message: "Not allowed to add development goals", code: "FORBIDDEN" } }, 403);
    }

    const memberExists = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: memberUserId, teamId } },
    });
    if (!memberExists) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const goal = await prisma.developmentGoal.create({
        data: {
          teamId,
          memberUserId,
          skill: body.skill,
          description: body.description?.trim() || null,
          dueDate: body.dueDate ?? null,
          priority: body.priority ?? "normal",
          steps: JSON.stringify(body.steps),
          completedStepIndexes: "[]",
          completedStepDates: "{}",
          createdById: user.id,
          lastActivityAt: new Date(),
        },
        include: goalInclude,
      });
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(goal) }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] POST failed");
    }
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/development-goals/:goalId
developmentGoalsRouter.patch(
  "/:memberUserId/development-goals/:goalId",
  zValidator("json", createGoalSchema),
  async (c) => {
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canUpdate = canManageDevelopmentGoal(membership, memberUserId);
    if (!canUpdate) {
      return c.json({ error: { message: "Not allowed to update development goals", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.developmentGoal.findFirst({
      where: { id: goalId, teamId, memberUserId, archivedAt: null },
    });
    if (!existing) {
      return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
    }
    if (
      body.status === "closed" &&
      !canCloseDevelopmentGoal(
        existing.completedStepIndexes,
        parseSteps(existing.steps).length,
      )
    ) {
      const progress = developmentGoalProgress(
        existing.completedStepIndexes,
        parseSteps(existing.steps).length,
      );
      return c.json(
        {
          error: {
            message: `Complete all goal steps before marking this goal complete. ${progress.totalStepCount - progress.completedStepCount} remaining.`,
            code: "GOAL_STEPS_INCOMPLETE",
          },
        },
        409,
      );
    }

    try {
      const previousSteps = parseSteps(existing.steps);
      const completedStepIndexes = remapCompletedStepIndexes(
        previousSteps,
        body.steps,
        developmentGoalProgress(
          existing.completedStepIndexes,
          previousSteps.length,
        ).completedStepIndexes,
      );
      const completedStepDates = remapCompletedStepDates(
        previousSteps,
        body.steps,
        parseCompletedStepDates(existing.completedStepDates),
      );
      const goal = await prisma.developmentGoal.update({
        where: { id: goalId },
        data: {
          skill: body.skill,
          ...(body.description !== undefined
            ? { description: body.description?.trim() || null }
            : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          steps: JSON.stringify(body.steps),
          completedStepIndexes: JSON.stringify(completedStepIndexes),
          completedStepDates: JSON.stringify(completedStepDates),
          ...touchActivityData(existing),
        },
        include: goalInclude,
      });
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(goal) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] PATCH failed");
    }
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/steps/completion
developmentGoalsRouter.patch(
  "/:memberUserId/development-goals/:goalId/steps/completion",
  zValidator("json", updateStepCompletionSchema),
  async (c) => {
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json(
        { error: { message: "Not a team member", code: "FORBIDDEN" } },
        403,
      );
    }
    if (
      !canCompleteDevelopmentGoalSteps(
        membership.role,
        membership.userId,
        memberUserId,
      )
    ) {
      return c.json(
        {
          error: {
            message: "Not allowed to update development goals",
            code: "FORBIDDEN",
          },
        },
        403,
      );
    }

    const existing = await prisma.developmentGoal.findFirst({
      where: { id: goalId, teamId, memberUserId, archivedAt: null },
    });
    if (!existing) {
      return c.json(
        { error: { message: "Goal not found", code: "NOT_FOUND" } },
        404,
      );
    }

    const totalStepCount = parseSteps(existing.steps).length;
    if (!isValidGoalStepIndex(body.stepIndex, totalStepCount)) {
      return c.json(
        {
          error: {
            message: "Action step not found",
            code: "INVALID_STEP",
          },
        },
        400,
      );
    }

    try {
      const completedStepIndexes = toggleCompletedStepIndex(
        existing.completedStepIndexes,
        totalStepCount,
        body.stepIndex,
        body.completed,
      );
      const completedStepDates = toggleCompletedStepDate(
        existing.completedStepDates,
        body.stepIndex,
        body.completed,
      );
      const goal = await prisma.developmentGoal.update({
        where: { id: goalId },
        data: {
          completedStepIndexes: JSON.stringify(completedStepIndexes),
          completedStepDates: JSON.stringify(completedStepDates),
          ...touchActivityData(existing),
        },
        include: goalInclude,
      });
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(goal) });
    } catch (err) {
      return prismaRouteError(
        c,
        err,
        "[development-goals] PATCH step completion failed",
      );
    }
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/status
developmentGoalsRouter.patch(
  "/:memberUserId/development-goals/:goalId/status",
  zValidator("json", updateStatusSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canUpdate = canManageDevelopmentGoal(membership, memberUserId);
    if (!canUpdate) {
      return c.json({ error: { message: "Not allowed to update development goals", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.developmentGoal.findFirst({
      where: { id: goalId, teamId, memberUserId, archivedAt: null },
    });
    if (!existing) {
      return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const now = new Date();
      const statusData = {
        status: body.status,
        closedAt: body.status === "closed" ? now : null,
        ...(body.status === "active" ? { lastActivityAt: now } : {}),
      };
      const emitsCompletion = shouldEmitDevelopmentGoalCompleted({
        previousStatus: existing.status,
        nextStatus: body.status,
        archivedAt: existing.archivedAt,
      });
      const goal = emitsCompletion
        ? await prisma.$transaction(async (tx) => {
            // Compare-and-set makes retries and concurrent close requests emit once.
            const transitioned = await tx.developmentGoal.updateMany({
              where: {
                id: goalId,
                teamId,
                memberUserId,
                archivedAt: null,
                status: existing.status,
              },
              data: statusData,
            });
            if (transitioned.count === 1) {
              await tx.teamActivity.create({
                data: {
                  teamId,
                  userId: memberUserId,
                  type: "development_goal_completed",
                  metadata: JSON.stringify({
                    goalId,
                    targetUserId: memberUserId,
                    completedByUserId: user.id,
                  }),
                },
              });
            }
            return tx.developmentGoal.findUnique({
              where: { id: goalId },
              include: goalInclude,
            });
          })
        : await prisma.developmentGoal.update({
            where: { id: goalId },
            data: statusData,
            include: goalInclude,
          });
      if (!goal) {
        return c.json(
          { error: { message: "Goal not found", code: "NOT_FOUND" } },
          404,
        );
      }
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(goal) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] PATCH status failed");
    }
  },
);

// DELETE /api/teams/:teamId/members/:memberUserId/development-goals/:goalId
developmentGoalsRouter.delete("/:memberUserId/development-goals/:goalId", async (c) => {
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const goalId = c.req.param("goalId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const canDelete = canManageDevelopmentGoal(membership, memberUserId);
  if (!canDelete) {
    return c.json({ error: { message: "Not allowed to delete development goals", code: "FORBIDDEN" } }, 403);
  }

  const existing = await prisma.developmentGoal.findFirst({
    where: { id: goalId, teamId, memberUserId, archivedAt: null },
  });
  if (!existing) {
    return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    await prisma.developmentGoal.delete({ where: { id: goalId } });
    await publishTeamGoalsUpdated(teamId);
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return prismaRouteError(c, err, "[development-goals] DELETE failed");
  }
});

// DELETE /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/notes/:noteId
developmentGoalsRouter.delete(
  "/:memberUserId/development-goals/:goalId/notes/:noteId",
  async (c) => {
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const noteId = c.req.param("noteId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canEditNote = canManageDevelopmentGoal(membership, memberUserId);
    if (!canEditNote) {
      return c.json({ error: { message: "Not allowed to edit notes", code: "FORBIDDEN" } }, 403);
    }

    const note = await prisma.developmentGoalNote.findFirst({
      where: {
        id: noteId,
        goalId,
        goal: { teamId, memberUserId, archivedAt: null },
      },
    });
    if (!note) {
      return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      await prisma.developmentGoalNote.delete({ where: { id: noteId } });
      const updated = await prisma.developmentGoal.findUnique({
        where: { id: goalId },
        include: goalInclude,
      });
      if (!updated) {
        return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
      }
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(updated) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] DELETE note failed");
    }
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/notes/:noteId
developmentGoalsRouter.patch(
  "/:memberUserId/development-goals/:goalId/notes/:noteId",
  zValidator("json", createNoteSchema),
  async (c) => {
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const noteId = c.req.param("noteId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canEditNote = canManageDevelopmentGoal(membership, memberUserId);
    if (!canEditNote) {
      return c.json({ error: { message: "Not allowed to edit notes", code: "FORBIDDEN" } }, 403);
    }

    const note = await prisma.developmentGoalNote.findFirst({
      where: {
        id: noteId,
        goalId,
        goal: { teamId, memberUserId, archivedAt: null },
      },
    });
    if (!note) {
      return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      await prisma.developmentGoalNote.update({
        where: { id: noteId },
        data: { body: body.body },
      });
      await prisma.developmentGoal.update({
        where: { id: goalId },
        data: touchActivityData(
          await prisma.developmentGoal.findUniqueOrThrow({ where: { id: goalId } }),
        ),
      });
      const updated = await prisma.developmentGoal.findUnique({
        where: { id: goalId },
        include: goalInclude,
      });
      if (!updated) {
        return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
      }
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(updated) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] PATCH note failed");
    }
  },
);

// POST /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/notes
developmentGoalsRouter.post(
  "/:memberUserId/development-goals/:goalId/notes",
  zValidator("json", createNoteSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const goalId = c.req.param("goalId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const canAddNote = canManageDevelopmentGoal(membership, memberUserId);
    if (!canAddNote) {
      return c.json({ error: { message: "Not allowed to add notes", code: "FORBIDDEN" } }, 403);
    }

    const goal = await prisma.developmentGoal.findFirst({
      where: { id: goalId, teamId, memberUserId, archivedAt: null },
    });
    if (!goal) {
      return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      await prisma.developmentGoalNote.create({
        data: {
          goalId,
          body: body.body,
          createdById: user.id,
        },
      });
      await prisma.developmentGoal.update({
        where: { id: goalId },
        data: touchActivityData(goal),
      });
      const updated = await prisma.developmentGoal.findUnique({
        where: { id: goalId },
        include: goalInclude,
      });
      if (!updated) {
        return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
      }
      await publishTeamGoalsUpdated(teamId);
      return c.json({ data: serializeGoal(updated) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] POST note failed");
    }
  },
);

export { developmentGoalsRouter };
