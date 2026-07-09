import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError, isPrismaSchemaMissingError } from "../lib/prisma-errors";
import { sendPushToUsers } from "../lib/push";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  associateFeedbackDueDate,
  associateFeedbackTaskTitle,
  encodeFeedbackTaskDescription,
  isAssociateRequestedField,
  NO_FEEDBACK_VALUE,
  type OneOnOneTemplateFieldLike,
} from "../lib/one-on-one-feedback";
import { appendLeaderCommentsFields, readLeaderCommentsFromMeeting } from "../lib/check-in-leader-comments";
import { oneOnOnePublishedAt } from "../lib/one-on-one-meeting-dates";
import { parseCalendarDueDate } from "../lib/recurrence-series";
import { resolveTimeZone } from "../lib/timezone";
import {
  hasArchivedMemberRecords,
  isActiveTeamMember,
} from "../lib/workspace-member-departure";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const oneOnOneMeetingsRouter = new Hono<{ Variables: Variables }>();
oneOnOneMeetingsRouter.use("*", authGuard);

type TemplateField = OneOnOneTemplateFieldLike & {
  order: number;
  ratingMax?: number;
};

const associateFeedbackSchema = z.object({
  fieldId: z.string().min(1),
  response: z.string().max(10000),
});

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
  requestAssociateFeedback: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
});

const updateMeetingSchema = z.object({
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
  followUpTasks: z.array(followUpTaskSchema).optional(),
  requestAssociateFeedback: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
});

const meetingInclude = {
  createdBy: { select: { id: true, name: true, email: true, image: true } },
};

const taskAssignmentInclude = {
  assignments: {
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  },
} as const;

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

function canManageOneOnOne(membership: { role: string }): boolean {
  return membership.role === "owner" || membership.role === "team_leader";
}

async function resolveCheckInMemberAccess(
  membership: { role: string },
  teamId: string,
  memberUserId: string,
  options: { write?: boolean },
): Promise<{ ok: true; isFormer: boolean } | { ok: false }> {
  const active = await isActiveTeamMember(prisma, teamId, memberUserId);
  if (active) return { ok: true, isFormer: false };
  if (options.write) return { ok: false };
  if (!canManageOneOnOne(membership)) return { ok: false };
  const hasArchive = await hasArchivedMemberRecords(prisma, teamId, memberUserId);
  if (!hasArchive) return { ok: false };
  return { ok: true, isFormer: true };
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
  status?: string;
  publishedAt?: Date | null;
  createdById: string;
  createdAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
}) {
  return {
    id: meeting.id,
    teamId: meeting.teamId,
    memberUserId: meeting.memberUserId,
    templateId: meeting.templateId,
    templateTitle: meeting.templateTitle,
    templateFields: parseJsonArray(meeting.templateFields),
    responses: parseResponses(meeting.responses),
    status: meeting.status === "draft" ? "draft" : "published",
    publishedAt: oneOnOnePublishedAt(meeting)?.toISOString() ?? null,
    createdById: meeting.createdById,
    createdAt: meeting.createdAt.toISOString(),
    createdBy: meeting.createdBy,
  };
}

async function loadFollowUpTasks(meetingId: string) {
  try {
    const tasks = await prisma.task.findMany({
      where: { oneOnOneMeetingId: meetingId },
      include: taskAssignmentInclude,
      orderBy: { createdAt: "asc" },
    });
    return tasks.map(serializeFollowUpTask);
  } catch (err) {
    if (!isPrismaSchemaMissingError(err)) throw err;
    const rows = await prisma.$queryRaw<
      Array<{ id: string; title: string; description: string | null; status: string; dueDate: Date | null }>
    >`SELECT id, title, description, status, "dueDate" FROM "Task" WHERE "oneOnOneMeetingId" = ${meetingId} ORDER BY "createdAt" ASC`;
    const loaded = await Promise.all(
      rows.map(async (row) => {
        const assignments = await prisma.taskAssignment.findMany({
          where: { taskId: row.id },
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        });
        return serializeFollowUpTask({
          ...row,
          assignments: assignments.map((a) => ({ user: a.user })),
        });
      }),
    );
    return loaded;
  }
}

async function serializeMeetingWithTasks(meeting: {
  id: string;
  teamId: string;
  memberUserId: string;
  templateId: string | null;
  templateTitle: string;
  templateFields: string;
  responses: string;
  status?: string;
  publishedAt?: Date | null;
  createdById: string;
  createdAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
}) {
  const followUpTasks = await loadFollowUpTasks(meeting.id);
  const responses = parseResponses(meeting.responses);
  const isDraft = meeting.status === "draft";
  const associateFeedbackPending =
    !isDraft &&
    !associateFeedbackAnswered(responses) &&
    (await feedbackRequestAlreadySent(meeting.id, ASSOCIATE_FEEDBACK_FIELD_ID));
  return {
    ...serializeMeeting(meeting),
    followUpTasks,
    associateFeedbackPending,
  };
}

function validateResponses(
  fields: TemplateField[],
  responses: Record<string, string | number>,
  options?: { draft?: boolean },
) {
  const draft = options?.draft === true;
  for (const field of fields) {
    if (field.type === "section" || field.type === "associate_notes") continue;
    if (isAssociateRequestedField(field)) continue;
    const value = responses[field.id];
    if (field.required && !draft) {
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
    if (field.type === "yes_no" && value !== undefined && value !== "") {
      const answer = String(value).toLowerCase();
      if (answer !== "yes" && answer !== "no") {
        return `${field.label} must be Yes or No.`;
      }
    }
  }
  return null;
}

function canModifyMeeting(membership: { role: string }) {
  return canManageOneOnOne(membership);
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

async function feedbackRequestAlreadySent(meetingId: string, fieldId: string) {
  const tasks = await prisma.task.findMany({
    where: { oneOnOneMeetingId: meetingId },
    select: { description: true },
  });
  return tasks.some((task) => task.description?.includes(`"fieldId":"${fieldId}"`));
}

async function completeFeedbackTasks(meetingId: string, fieldId: string) {
  const tasks = await prisma.task.findMany({
    where: { oneOnOneMeetingId: meetingId, status: { not: "done" } },
    select: { id: true, description: true },
  });
  const toComplete = tasks.filter((task) => task.description?.includes(`"fieldId":"${fieldId}"`));
  if (toComplete.length === 0) return;
  await prisma.task.updateMany({
    where: { id: { in: toComplete.map((task) => task.id) } },
    data: { status: "done", completedAt: new Date() },
  });
}

function associateFeedbackAnswered(responses: Record<string, string | number>): boolean {
  const answer = responses[ASSOCIATE_FEEDBACK_FIELD_ID];
  if (answer === undefined) return false;
  if (String(answer) === NO_FEEDBACK_VALUE) return true;
  return String(answer).trim() !== "";
}

async function createMeetingAssociateFeedbackRequest(
  meeting: {
    id: string;
    teamId: string;
    memberUserId: string;
    templateTitle: string;
  },
  requestAssociateFeedback: boolean,
  responses: Record<string, string | number>,
  creatorId: string,
  managerName: string,
) {
  if (!requestAssociateFeedback) return;
  if (associateFeedbackAnswered(responses)) return;
  if (await feedbackRequestAlreadySent(meeting.id, ASSOCIATE_FEEDBACK_FIELD_ID)) return;

  const meta = {
    meetingId: meeting.id,
    fieldId: ASSOCIATE_FEEDBACK_FIELD_ID,
    teamId: meeting.teamId,
    memberUserId: meeting.memberUserId,
    fieldLabel: ASSOCIATE_FEEDBACK_LABEL,
  };

  const description = encodeFeedbackTaskDescription(meta);
  const task = await prisma.task.create({
    data: {
      title: associateFeedbackTaskTitle(meeting.templateTitle),
      description,
      priority: "medium",
      status: "todo",
      dueDate: associateFeedbackDueDate(),
      teamId: meeting.teamId,
      creatorId,
      oneOnOneMeetingId: meeting.id,
      assignments: { create: [{ userId: meeting.memberUserId }] },
    },
  });

  if (meeting.memberUserId !== creatorId) {
    await sendPushToUsers(
      [meeting.memberUserId],
      "Time to reflect on your check-in",
      `${managerName} saved your ${meeting.templateTitle} check-in — add your takeaways when you have a moment.`,
      { taskId: task.id, teamId: meeting.teamId, type: "oneone_feedback" },
      "notifTaskAssigned",
      meeting.teamId,
    );
  }
}

function resolveFeedbackField(fieldId: string, fields: TemplateField[]) {
  if (fieldId === ASSOCIATE_FEEDBACK_FIELD_ID) {
    return {
      id: ASSOCIATE_FEEDBACK_FIELD_ID,
      label: ASSOCIATE_FEEDBACK_LABEL,
      helpText: null,
      associateRequest: "task" as const,
    };
  }
  const field = fields.find((f) => f.id === fieldId);
  if (!field || !isAssociateRequestedField(field)) return null;
  return {
    id: field.id,
    label: field.label,
    helpText: field.helpText ?? null,
    associateRequest: field.associateRequest ?? null,
  };
}

async function createFollowUpTasks(
  meetingId: string,
  teamId: string,
  creatorId: string,
  tasks: z.infer<typeof followUpTaskSchema>[],
  timeZone?: string | null,
) {
  if (tasks.length === 0) return;
  const tz = resolveTimeZone(timeZone);

  for (const task of tasks) {
    const dueDate =
      task.dueDate && !Number.isNaN(Date.parse(task.dueDate))
        ? parseCalendarDueDate(task.dueDate, tz)
        : null;
    const baseData = {
      title: task.title.trim(),
      description: task.description?.trim() || null,
      priority: "medium",
      status: "todo",
      dueDate,
      teamId,
      creatorId,
      assignments: { create: [{ userId: task.assigneeUserId }] },
    };

    try {
      await prisma.task.create({
        data: {
          ...baseData,
          oneOnOneMeetingId: meetingId,
        },
      });
    } catch (err) {
      console.error("[one-on-one-meetings] linked task create failed, retrying link update:", err);
      const created = await prisma.task.create({ data: baseData });
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Task" SET "oneOnOneMeetingId" = $1 WHERE "id" = $2`,
          meetingId,
          created.id,
        );
      } catch (linkErr) {
        console.error("[one-on-one-meetings] task link update failed:", linkErr);
        throw new Error("Could not link follow-up task to this check-in.");
      }
    }
  }
}

  }
}

// GET /api/teams/:teamId/members/:memberUserId/planned-one-on-ones
oneOnOneMeetingsRouter.get("/:memberUserId/planned-one-on-ones", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }
  if (!canManageOneOnOne(membership)) {
    return c.json({ error: { message: "Only workspace owners and team leaders can view planned 1:1s.", code: "FORBIDDEN" } }, 403);
  }

  const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, {});
  if (!access.ok || access.isFormer) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const now = Date.now();
    const events = await prisma.calendarEvent.findMany({
      where: {
        teamId,
        oneOnOneMemberUserId: memberUserId,
        OR: [{ isOneOnOne: true }, { title: { startsWith: "1:1 —" } }],
      },
      orderBy: { startDate: "asc" },
    });

    const upcoming = events.filter((event) => {
      if (event.createdById !== user.id) return false;
      const endMs = new Date(event.endDate ?? event.startDate).getTime();
      return endMs >= now;
    });

    return c.json({
      data: upcoming.map((event) => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate?.toISOString() ?? null,
        allDay: event.allDay,
        isVideoMeeting: event.isVideoMeeting,
        isOneOnOne: event.isOneOnOne,
        oneOnOneMemberUserId: event.oneOnOneMemberUserId,
        oneOnOneTemplateId: event.oneOnOneTemplateId,
      })),
    });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] planned-one-on-ones GET failed");
  }
});

// GET /api/teams/:teamId/members/:memberUserId/one-on-ones
oneOnOneMeetingsRouter.get("/:memberUserId/one-on-ones", async (c) => {
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, {});
  if (!access.ok) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const where: { teamId: string; memberUserId: string; status?: string } = { teamId, memberUserId };
    if (!canManageOneOnOne(membership) || access.isFormer) {
      where.status = "published";
    }

    const meetings = await prisma.oneOnOneMeeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { createdAt: "desc" },
    });

    const data = await Promise.all(meetings.map((meeting) => serializeMeetingWithTasks(meeting)));
    return c.json({ data });
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

    if (!canManageOneOnOne(membership)) {
      return c.json({ error: { message: "You cannot create a check-in for this member", code: "FORBIDDEN" } }, 403);
    }

    const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, { write: true });
    if (!access.ok) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    const body = c.req.valid("json");
    const isDraft = body.status === "draft";
    const template = await prisma.oneOnOneTemplate.findFirst({
      where: { id: body.templateId, teamId },
    });
    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const fields = appendLeaderCommentsFields(parseJsonArray(template.fields));
    const validationError = validateResponses(fields, body.responses, { draft: isDraft });
    if (validationError) {
      return c.json({ error: { message: validationError, code: "VALIDATION_ERROR" } }, 400);
    }

    const templateFieldsJson = JSON.stringify(fields);

    const followUpTasks = isDraft ? [] : (body.followUpTasks ?? []);
    const followUpError = await validateFollowUpAssignees(teamId, memberUserId, user.id, followUpTasks);
    if (followUpError) {
      return c.json({ error: { message: followUpError, code: "VALIDATION_ERROR" } }, 400);
    }

    try {
      const meeting = await prisma.$transaction(async (tx) => {
        const created = await tx.oneOnOneMeeting.create({
          data: {
            teamId,
            memberUserId,
            templateId: template.id,
            templateTitle: template.title,
            templateFields: templateFieldsJson,
            responses: JSON.stringify(body.responses),
            status: isDraft ? "draft" : "published",
            publishedAt: isDraft ? null : new Date(),
            createdById: user.id,
          },
          include: meetingInclude,
        });

        if (followUpTasks.length > 0) {
          const tz = resolveTimeZone(user.timezone);
          for (const task of followUpTasks) {
            const dueDate =
              task.dueDate && !Number.isNaN(Date.parse(task.dueDate))
                ? parseCalendarDueDate(task.dueDate, tz)
                : null;
            const baseData = {
              title: task.title.trim(),
              description: task.description?.trim() || null,
              priority: "medium",
              status: "todo",
              dueDate,
              teamId,
              creatorId: user.id,
              assignments: { create: [{ userId: task.assigneeUserId }] },
            };
            try {
              await tx.task.create({
                data: { ...baseData, oneOnOneMeetingId: created.id },
              });
            } catch {
              const taskRow = await tx.task.create({ data: baseData });
              await tx.$executeRawUnsafe(
                `UPDATE "Task" SET "oneOnOneMeetingId" = $1 WHERE "id" = $2`,
                created.id,
                taskRow.id,
              );
            }
          }
        }

        return created;
      });

      const managerName = user.name?.trim() || user.email || "Your manager";
      if (!isDraft) {
        await createMeetingAssociateFeedbackRequest(
          meeting,
          body.requestAssociateFeedback === true,
          body.responses,
          user.id,
          managerName,
        );
      }

      return c.json({ data: await serializeMeetingWithTasks(meeting) }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "[one-on-one-meetings] POST failed");
    }
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

    const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, { write: true });
    if (!access.ok) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    const existing = await prisma.oneOnOneMeeting.findFirst({
      where: { id: meetingId, teamId, memberUserId },
    });
    if (!existing) {
      return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
    }

    if (!canModifyMeeting(membership)) {
      return c.json({ error: { message: "You cannot edit this check-in", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const nextStatus =
      body.status ?? (existing.status === "draft" ? "draft" : "published");
    const isDraft = nextStatus === "draft";

    if (existing.status === "published" && body.status === "draft") {
      return c.json(
        { error: { message: "Published check-ins cannot be moved back to draft.", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    const fields = parseJsonArray(existing.templateFields);
    const validationError = validateResponses(fields, body.responses, { draft: isDraft });
    if (validationError) {
      return c.json({ error: { message: validationError, code: "VALIDATION_ERROR" } }, 400);
    }

    const followUpTasks = isDraft ? [] : (body.followUpTasks ?? []);
    const followUpError = await validateFollowUpAssignees(
      teamId,
      memberUserId,
      existing.createdById,
      followUpTasks,
    );
    if (followUpError) {
      return c.json({ error: { message: followUpError, code: "VALIDATION_ERROR" } }, 400);
    }

    const publishingNow = existing.status === "draft" && nextStatus === "published";

    try {
      await prisma.oneOnOneMeeting.update({
        where: { id: meetingId },
        data: {
          responses: JSON.stringify(body.responses),
          status: nextStatus,
          ...(publishingNow ? { publishedAt: new Date() } : {}),
        },
      });

      if (followUpTasks.length > 0) {
        await createFollowUpTasks(meetingId, teamId, user.id, followUpTasks, user.timezone);
      }

      const managerName = user.name?.trim() || user.email || "Your manager";
      if (!isDraft) {
        await createMeetingAssociateFeedbackRequest(
          { id: meetingId, teamId, memberUserId, templateTitle: existing.templateTitle },
          body.requestAssociateFeedback === true,
          body.responses,
          user.id,
          managerName,
        );
      }

      const meeting = await prisma.oneOnOneMeeting.findUnique({
        where: { id: meetingId },
        include: meetingInclude,
      });
      if (!meeting) {
        return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
      }
      return c.json({ data: await serializeMeetingWithTasks(meeting) });
    } catch (err) {
      return prismaRouteError(c, err, "[one-on-one-meetings] PATCH failed");
    }
  },
);

// GET /api/teams/:teamId/members/:memberUserId/one-on-ones/:meetingId/associate-feedback/:fieldId
oneOnOneMeetingsRouter.get("/:memberUserId/one-on-ones/:meetingId/associate-feedback/:fieldId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const meetingId = c.req.param("meetingId") as string;
  const fieldId = c.req.param("fieldId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const meeting = await prisma.oneOnOneMeeting.findFirst({
    where: { id: meetingId, teamId },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!meeting) {
    return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
  }

  if (user.id !== meeting.memberUserId) {
    return c.json({ error: { message: "Only the associate can submit this feedback", code: "FORBIDDEN" } }, 403);
  }

  if (meeting.status === "draft") {
    return c.json({ error: { message: "This check-in is still a draft.", code: "FORBIDDEN" } }, 403);
  }

  const fields = parseJsonArray(meeting.templateFields) as TemplateField[];
  const field = resolveFeedbackField(fieldId, fields);
  if (!field) {
    return c.json({ error: { message: "Feedback field not found", code: "NOT_FOUND" } }, 404);
  }

  const responses = parseResponses(meeting.responses);
  const currentResponse = responses[fieldId];
  const submitted =
    currentResponse !== undefined &&
    (String(currentResponse) === NO_FEEDBACK_VALUE || String(currentResponse).trim() !== "");
  const leaderComments = readLeaderCommentsFromMeeting(fields, responses);
  const leaderCommentsFrom = leaderComments
    ? meeting.createdBy?.name?.trim() || meeting.createdBy?.email || "Your leader"
    : null;

  return c.json({
    data: {
      fieldId: field.id,
      fieldLabel: field.label,
      helpText: field.helpText,
      meetingTitle: meeting.templateTitle,
      currentResponse: submitted ? String(currentResponse) : "",
      submitted,
      associateRequest: field.associateRequest,
      leaderComments: leaderComments?.text ?? null,
      leaderCommentsLabel: leaderComments?.label ?? null,
      leaderCommentsFrom,
    },
  });
});

// POST /api/teams/:teamId/members/:memberUserId/one-on-ones/:meetingId/associate-feedback
oneOnOneMeetingsRouter.post(
  "/:memberUserId/one-on-ones/:meetingId/associate-feedback",
  zValidator("json", associateFeedbackSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const meetingId = c.req.param("meetingId") as string;
    const body = c.req.valid("json");

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const meeting = await prisma.oneOnOneMeeting.findFirst({
      where: { id: meetingId, teamId },
    });
    if (!meeting) {
      return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
    }

    if (user.id !== meeting.memberUserId) {
      return c.json({ error: { message: "Only the associate can submit this feedback", code: "FORBIDDEN" } }, 403);
    }

    if (meeting.status === "draft") {
      return c.json({ error: { message: "This check-in is still a draft.", code: "FORBIDDEN" } }, 403);
    }

    const fields = parseJsonArray(meeting.templateFields) as TemplateField[];
    const field = resolveFeedbackField(body.fieldId, fields);
    if (!field) {
      return c.json({ error: { message: "Feedback field not found", code: "NOT_FOUND" } }, 404);
    }

    const trimmed = body.response.trim();
    if (trimmed !== NO_FEEDBACK_VALUE && trimmed.length === 0) {
      return c.json(
        { error: { message: "Enter feedback or choose no feedback entered.", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    const responses = parseResponses(meeting.responses);
    responses[body.fieldId] = trimmed === NO_FEEDBACK_VALUE ? NO_FEEDBACK_VALUE : trimmed;

    await prisma.oneOnOneMeeting.update({
      where: { id: meetingId },
      data: { responses: JSON.stringify(responses) },
    });
    await completeFeedbackTasks(meetingId, body.fieldId);

    const updated = await prisma.oneOnOneMeeting.findUnique({
      where: { id: meetingId },
      include: meetingInclude,
    });
    if (!updated) {
      return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
    }

    return c.json({ data: await serializeMeetingWithTasks(updated) });
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

  const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, { write: true });
  if (!access.ok) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.oneOnOneMeeting.findFirst({
    where: { id: meetingId, teamId, memberUserId },
  });
  if (!existing) {
    return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
  }

  if (!canModifyMeeting(membership)) {
    return c.json({ error: { message: "You cannot delete this check-in", code: "FORBIDDEN" } }, 403);
  }

  try {
    await prisma.oneOnOneMeeting.delete({ where: { id: meetingId } });
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] DELETE failed");
  }
});

export { oneOnOneMeetingsRouter };
