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

const oneOnOneMeetingsRouter = new Hono<{ Variables: Variables }>();
oneOnOneMeetingsRouter.use("*", authGuard);

type TemplateField = {
  id: string;
  label: string;
  type: string;
  order: number;
  required?: boolean;
  ratingMax?: number;
};

const followUpTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  assigneeUserId: z.string().min(1),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.string().optional(),
});

const createMeetingSchema = z.object({
  templateId: z.string().min(1),
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
  followUpTasks: z.array(followUpTaskSchema).optional(),
});

const updateMeetingSchema = z.object({
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
  followUpTasks: z.array(followUpTaskSchema).optional(),
});

const meetingInclude = {
  createdBy: { select: { id: true, name: true, email: true, image: true } },
  followUpTasks: {
    orderBy: { createdAt: "asc" as const },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  },
};

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

function parseJsonArray(raw: string): TemplateField[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateField[]) : [];
  } catch {
    return [];
  }
}

function parseResponses(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number>;
  } catch {
    return {};
  }
}

function canCreateMeeting(membership: { role: string }, memberUserId: string, userId: string) {
  if (memberUserId === userId) return true;
  return membership.role === "owner" || membership.role === "team_leader";
}

function serializeFollowUpTask(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  assignments: Array<{
    user: { id: string; name: string | null; email: string; image: string | null };
  }>;
}) {
  const assignee = task.assignments[0]?.user ?? null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    assignee,
  };
}

function serializeMeeting(meeting: {
  id: string;
  teamId: string;
  memberUserId: string;
  templateId: string | null;
  templateTitle: string;
  templateFields: string;
  responses: string;
  createdById: string;
  createdAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  followUpTasks?: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueDate: Date | null;
    assignments: Array<{
      user: { id: string; name: string | null; email: string; image: string | null };
    }>;
  }>;
}) {
  return {
    id: meeting.id,
    teamId: meeting.teamId,
    memberUserId: meeting.memberUserId,
    templateId: meeting.templateId,
    templateTitle: meeting.templateTitle,
    templateFields: parseJsonArray(meeting.templateFields),
    responses: parseResponses(meeting.responses),
    createdById: meeting.createdById,
    createdAt: meeting.createdAt.toISOString(),
    createdBy: meeting.createdBy,
    followUpTasks: (meeting.followUpTasks ?? []).map(serializeFollowUpTask),
  };
}

function validateResponses(fields: TemplateField[], responses: Record<string, string | number>) {
  for (const field of fields) {
    if (field.type === "section") continue;
    const value = responses[field.id];
    if (field.required) {
      if (field.type === "rating") {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num) || num < 1) {
          return `${field.label} is required.`;
        }
      } else if (value === undefined || value === null || String(value).trim() === "") {
        return `${field.label} is required.`;
      }
    }
    if (field.type === "rating" && value !== undefined && value !== "") {
      const num = typeof value === "number" ? value : Number(value);
      const max = field.ratingMax ?? 5;
      if (!Number.isFinite(num) || num < 1 || num > max) {
        return `${field.label} must be between 1 and ${max}.`;
      }
    }
  }
  return null;
}

function canModifyMeeting(
  membership: { role: string },
  memberUserId: string,
  userId: string,
  createdById: string,
) {
  if (createdById === userId) return true;
  return canCreateMeeting(membership, memberUserId, userId);
}

async function validateFollowUpAssignees(
  teamId: string,
  memberUserId: string,
  createdById: string,
  tasks: z.infer<typeof followUpTaskSchema>[],
) {
  const allowed = new Set([memberUserId, createdById]);
  const leaders = await prisma.teamMember.findMany({
    where: { teamId, role: { in: ["owner", "team_leader"] } },
    select: { userId: true },
  });
  for (const leader of leaders) allowed.add(leader.userId);

  for (const task of tasks) {
    if (!allowed.has(task.assigneeUserId)) {
      return "Follow-up tasks must be assigned to the associate or a team leader.";
    }
    const membership = await prisma.teamMember.findFirst({
      where: { teamId, userId: task.assigneeUserId },
    });
    if (!membership) {
      return "Follow-up assignee must be a team member.";
    }
  }
  return null;
}

async function createFollowUpTasks(
  meetingId: string,
  teamId: string,
  creatorId: string,
  tasks: z.infer<typeof followUpTaskSchema>[],
) {
  if (tasks.length === 0) return;

  for (const task of tasks) {
    const dueDate =
      task.dueDate && !Number.isNaN(Date.parse(task.dueDate)) ? new Date(task.dueDate) : null;
    await prisma.task.create({
      data: {
        title: task.title.trim(),
        description: task.description?.trim() || null,
        priority: "medium",
        status: "todo",
        dueDate,
        teamId,
        creatorId,
        oneOnOneMeetingId: meetingId,
        assignments: { create: [{ userId: task.assigneeUserId }] },
      },
    });
  }
}

// GET /api/teams/:teamId/members/:memberUserId/one-on-ones
oneOnOneMeetingsRouter.get("/:memberUserId/one-on-ones", async (c) => {
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
  });
  if (!targetMember) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const meetings = await prisma.oneOnOneMeeting.findMany({
      where: { teamId, memberUserId },
      include: meetingInclude,
      orderBy: { createdAt: "desc" },
    });

    return c.json({ data: meetings.map(serializeMeeting) });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] GET failed");
  }
});

// POST /api/teams/:teamId/members/:memberUserId/one-on-ones
oneOnOneMeetingsRouter.post(
  "/:memberUserId/one-on-ones",
  zValidator("json", createMeetingSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    if (!canCreateMeeting(membership, memberUserId, user.id)) {
      return c.json({ error: { message: "You cannot create a 1:1 for this member", code: "FORBIDDEN" } }, 403);
    }

    const targetMember = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: memberUserId, teamId } },
    });
    if (!targetMember) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    const body = c.req.valid("json");
    const template = await prisma.oneOnOneTemplate.findFirst({
      where: { id: body.templateId, teamId },
    });
    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const fields = parseJsonArray(template.fields);
    const validationError = validateResponses(fields, body.responses);
    if (validationError) {
      return c.json({ error: { message: validationError, code: "VALIDATION_ERROR" } }, 400);
    }

    const followUpTasks = body.followUpTasks ?? [];
    const followUpError = await validateFollowUpAssignees(teamId, memberUserId, user.id, followUpTasks);
    if (followUpError) {
      return c.json({ error: { message: followUpError, code: "VALIDATION_ERROR" } }, 400);
    }

    const meeting = await prisma.oneOnOneMeeting.create({
      data: {
        teamId,
        memberUserId,
        templateId: template.id,
        templateTitle: template.title,
        templateFields: template.fields,
        responses: JSON.stringify(body.responses),
        createdById: user.id,
      },
      include: meetingInclude,
    });

    if (followUpTasks.length > 0) {
      await createFollowUpTasks(meeting.id, teamId, user.id, followUpTasks);
    }

    const withTasks = await prisma.oneOnOneMeeting.findUnique({
      where: { id: meeting.id },
      include: meetingInclude,
    });

    return c.json({ data: serializeMeeting(withTasks ?? meeting) }, 201);
  },
);

// PATCH /api/teams/:teamId/members/:memberUserId/one-on-ones/:meetingId
oneOnOneMeetingsRouter.patch(
  "/:memberUserId/one-on-ones/:meetingId",
  zValidator("json", updateMeetingSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const meetingId = c.req.param("meetingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.oneOnOneMeeting.findFirst({
      where: { id: meetingId, teamId, memberUserId },
    });
    if (!existing) {
      return c.json({ error: { message: "1:1 not found", code: "NOT_FOUND" } }, 404);
    }

    if (!canModifyMeeting(membership, memberUserId, user.id, existing.createdById)) {
      return c.json({ error: { message: "You cannot edit this 1:1", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const fields = parseJsonArray(existing.templateFields);
    const validationError = validateResponses(fields, body.responses);
    if (validationError) {
      return c.json({ error: { message: validationError, code: "VALIDATION_ERROR" } }, 400);
    }

    const followUpTasks = body.followUpTasks ?? [];
    const followUpError = await validateFollowUpAssignees(
      teamId,
      memberUserId,
      existing.createdById,
      followUpTasks,
    );
    if (followUpError) {
      return c.json({ error: { message: followUpError, code: "VALIDATION_ERROR" } }, 400);
    }

    try {
      await prisma.oneOnOneMeeting.update({
        where: { id: meetingId },
        data: { responses: JSON.stringify(body.responses) },
      });

      if (followUpTasks.length > 0) {
        await createFollowUpTasks(meetingId, teamId, user.id, followUpTasks);
      }

      const meeting = await prisma.oneOnOneMeeting.findUnique({
        where: { id: meetingId },
        include: meetingInclude,
      });
      if (!meeting) {
        return c.json({ error: { message: "1:1 not found", code: "NOT_FOUND" } }, 404);
      }
      return c.json({ data: serializeMeeting(meeting) });
    } catch (err) {
      return prismaRouteError(c, err, "[one-on-one-meetings] PATCH failed");
    }
  },
);

// DELETE /api/teams/:teamId/members/:memberUserId/one-on-ones/:meetingId
oneOnOneMeetingsRouter.delete("/:memberUserId/one-on-ones/:meetingId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const meetingId = c.req.param("meetingId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const existing = await prisma.oneOnOneMeeting.findFirst({
    where: { id: meetingId, teamId, memberUserId },
  });
  if (!existing) {
    return c.json({ error: { message: "1:1 not found", code: "NOT_FOUND" } }, 404);
  }

  if (!canModifyMeeting(membership, memberUserId, user.id, existing.createdById)) {
    return c.json({ error: { message: "You cannot delete this 1:1", code: "FORBIDDEN" } }, 403);
  }

  try {
    await prisma.oneOnOneMeeting.delete({ where: { id: meetingId } });
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] DELETE failed");
  }
});

export { oneOnOneMeetingsRouter };
