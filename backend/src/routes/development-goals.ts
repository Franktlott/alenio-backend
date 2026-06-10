import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";

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

function normalizeStatus(raw: string | null | undefined): "active" | "closed" {
  return raw === "closed" ? "closed" : "active";
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

function isManagerRole(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
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

function serializeGoal(goal: {
  id: string;
  teamId: string;
  memberUserId: string;
  skill: string;
  steps: string;
  status?: string | null;
  closedAt?: Date | null;
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
}) {
  return {
    id: goal.id,
    teamId: goal.teamId,
    memberUserId: goal.memberUserId,
    skill: goal.skill,
    steps: parseSteps(goal.steps),
    status: normalizeStatus(goal.status),
    closedAt: goal.closedAt ? goal.closedAt.toISOString() : null,
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

  try {
    const goals = await prisma.developmentGoal.findMany({
      where: { teamId, memberUserId },
      include: goalInclude,
      orderBy: { createdAt: "desc" },
    });
    return c.json({ data: goals.map(serializeGoal) });
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

    const canCreate =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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

    const canUpdate =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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

    const canUpdate =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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

  const canDelete =
    isManagerRole(membership.role) || membership.userId === memberUserId;
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

    const canEditNote =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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

    const canEditNote =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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

    const canAddNote =
      isManagerRole(membership.role) || membership.userId === memberUserId;
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
