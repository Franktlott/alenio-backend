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

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const developmentGoalsRouter = new Hono<{ Variables: Variables }>();
developmentGoalsRouter.use("*", authGuard);

const userSelect = { id: true, name: true, email: true, image: true } as const;

const createGoalSchema = z.object({
  skill: z.string().trim().min(1, "Skill is required").max(200),
  steps: z.array(z.string().trim().min(1).max(500)).min(1, "Add at least one step").max(20),
});

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note is required").max(5000),
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "closed"]),
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
  const isLeaderRole =
    membership.role === "owner" || membership.role === "team_leader" || membership.role === "admin";
  return isLeaderRole || membership.userId === memberUserId;
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
  steps: string;
  status?: string | null;
  closedAt?: Date | null;
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
) {
  const status = normalizeStatus(goal.status);
  const lastActivityAt = goal.lastActivityAt ?? goal.createdAt;
  const daysSinceActivity = daysSinceGoalActivity(goal, now);
  const daysUntilInactive = daysUntilGoalInactive({ ...goal, status }, now);
  return {
    id: goal.id,
    teamId: goal.teamId,
    memberUserId: goal.memberUserId,
    skill: goal.skill,
    steps: parseSteps(goal.steps),
    status,
    closedAt: goal.closedAt ? goal.closedAt.toISOString() : null,
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
  if (!activeMember) {
    const canViewArchive =
      canManageTeamRoster(membership.role) &&
      (await hasArchivedMemberRecords(prisma, teamId, memberUserId));
    if (!canViewArchive) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }
  } else if (
    membership.userId !== memberUserId &&
    !canManageTeamRoster(membership.role)
  ) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const goals = await prisma.developmentGoal.findMany({
      where: { teamId, memberUserId },
      include: goalInclude,
      orderBy: { createdAt: "desc" },
    });
    const inactiveIds = await reconcileInactiveGoals(goals);
    const now = new Date();
    return c.json({
      data: goals.map((goal) =>
        serializeGoal(
          inactiveIds.has(goal.id) ? { ...goal, status: "inactive" } : goal,
          now,
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
          steps: JSON.stringify(body.steps),
          createdById: user.id,
          lastActivityAt: new Date(),
        },
        include: goalInclude,
      });
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
      where: { id: goalId, teamId, memberUserId },
    });
    if (!existing) {
      return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const goal = await prisma.developmentGoal.update({
        where: { id: goalId },
        data: {
          skill: body.skill,
          steps: JSON.stringify(body.steps),
          ...touchActivityData(existing),
        },
        include: goalInclude,
      });
      return c.json({ data: serializeGoal(goal) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] PATCH failed");
    }
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/development-goals/:goalId/status
developmentGoalsRouter.patch(
  "/:memberUserId/development-goals/:goalId/status",
  zValidator("json", updateStatusSchema),
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
      where: { id: goalId, teamId, memberUserId },
    });
    if (!existing) {
      return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const goal = await prisma.developmentGoal.update({
        where: { id: goalId },
        data: {
          status: body.status,
          closedAt: body.status === "closed" ? new Date() : null,
          ...(body.status === "active" ? { lastActivityAt: new Date() } : {}),
        },
        include: goalInclude,
      });
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
    where: { id: goalId, teamId, memberUserId },
  });
  if (!existing) {
    return c.json({ error: { message: "Goal not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    await prisma.developmentGoal.delete({ where: { id: goalId } });
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
        goal: { teamId, memberUserId },
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
        goal: { teamId, memberUserId },
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
      where: { id: goalId, teamId, memberUserId },
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
      return c.json({ data: serializeGoal(updated) });
    } catch (err) {
      return prismaRouteError(c, err, "[development-goals] POST note failed");
    }
  },
);

export { developmentGoalsRouter };
