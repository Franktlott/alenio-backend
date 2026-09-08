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
  checkInEventTitle,
  plannedCheckInTitlesForMember,
  PLANNED_CHECK_IN_TITLE_PREFIXES,
} from "../lib/check-in-event-title";
import {
  hasArchivedCheckInRecords,
  isActiveTeamMember,
} from "../lib/workspace-member-departure";
import { removePlannedCheckInCalendarEvent } from "../lib/remove-planned-check-in-event";
import { canManageCheckIns, WORKSPACE_MANAGER_ROLES } from "../lib/workspace-role-policy";
import {
  applyMomentumCompletion,
  withSerializableMomentumTransaction,
} from "../lib/momentum-service";
import { logActivity } from "../lib/activity";
import { workspaceTaskClassificationForRole } from "../lib/task-policy";
import { publishUserInboxUpdated } from "../lib/realtime-hub";
import {
  contextIncludesCheckInSelection,
  resolveVideoCheckInContext,
  VideoRoomAccessError,
} from "../lib/video-check-in-context";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const oneOnOneMeetingsRouter = new Hono<{ Variables: Variables }>();
oneOnOneMeetingsRouter.use("*", authGuard);

async function publishTeamCheckInsUpdated(teamId: string): Promise<void> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  publishUserInboxUpdated(
    members.map((member) => member.userId),
    { kind: "team", teamId, resource: "check_ins" },
  );
}

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
  plannedCalendarEventId: z.string().min(1).optional(),
  sourceVideoRoomId: z.string().min(1).nullable().optional(),
  calendarEventId: z.string().min(1).nullable().optional(),
});

const updateMeetingSchema = z.object({
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
  followUpTasks: z.array(followUpTaskSchema).optional(),
  requestAssociateFeedback: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
  plannedCalendarEventId: z.string().min(1).optional(),
  sourceVideoRoomId: z.string().min(1).nullable().optional(),
  calendarEventId: z.string().min(1).nullable().optional(),
});

const meetingInclude = {
  createdBy: { select: { id: true, name: true, email: true, image: true } },
};

const taskAssignmentInclude = {
  assignments: {
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  },
} as const;

async function shouldRemovePlannedEventAfterPublish(
  eventId: string,
  teamId: string,
): Promise<boolean> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, teamId },
    select: { isVideoMeeting: true },
  });
  return event ? !event.isVideoMeeting : false;
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
  return canManageCheckIns(membership.role);
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
  const hasArchive = await hasArchivedCheckInRecords(prisma, teamId, memberUserId);
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
  sourceVideoRoomId?: string | null;
  calendarEventId?: string | null;
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
    sourceVideoRoomId: meeting.sourceVideoRoomId ?? null,
    calendarEventId: meeting.calendarEventId ?? null,
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
  sourceVideoRoomId?: string | null;
  calendarEventId?: string | null;
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
    where: { teamId, role: { in: [...WORKSPACE_MANAGER_ROLES] } },
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

async function completeFeedbackTasks(meetingId: string, fieldId: string, actorUserId: string) {
  const tasks = await prisma.task.findMany({
    where: { oneOnOneMeetingId: meetingId, status: { not: "done" } },
    select: { id: true, description: true },
  });
  const toComplete = tasks.filter((task) => task.description?.includes(`"fieldId":"${fieldId}"`));
  if (toComplete.length === 0) return;
  for (const candidate of toComplete) {
    const completedAt = new Date();
    const result = await withSerializableMomentumTransaction(prisma, async (tx) => {
      const current = await tx.task.findUnique({
        where: { id: candidate.id },
        select: { status: true },
      });
      if (!current || current.status === "done") return null;
      const task = await tx.task.update({
        where: { id: candidate.id },
        data: { status: "done", completedAt },
        select: {
          id: true,
          teamId: true,
          title: true,
          incognito: true,
          dueDate: true,
          assignments: {
            select: { userId: true, user: { select: { name: true, image: true } } },
          },
        },
      });
      const momentum = await applyMomentumCompletion(tx, {
        taskId: task.id,
        actorUserId,
        completedAt,
      });
      return { task, momentum };
    });
    if (!result) continue;
    await logActivity({
      teamId: result.task.teamId,
      userId: actorUserId,
      type: "task_completed",
      metadata: {
        taskId: result.task.id,
        idempotencyKey: `task_completed:${result.task.teamId}:${result.task.id}:${completedAt.toISOString()}`,
        momentumCreditIds: result.momentum.creditIds,
        taskTitle: result.task.incognito ? null : result.task.title,
        dueDate: result.task.dueDate?.toISOString() ?? null,
        completedAt: completedAt.toISOString(),
        completedOnTime: result.task.dueDate ? completedAt <= result.task.dueDate : null,
        assignees: result.task.assignments.map((assignment) => ({
          id: assignment.userId,
          name: assignment.user.name,
          image: assignment.user.image ?? null,
        })),
      },
    });
  }
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
  creatorRole: string,
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
  const classification = workspaceTaskClassificationForRole(creatorRole);
  const task = await prisma.task.create({
    data: {
      title: associateFeedbackTaskTitle(meeting.templateTitle),
      description,
      ...classification,
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
  timeZone: string | null | undefined,
  creatorRole: string,
) {
  if (tasks.length === 0) return;
  const tz = resolveTimeZone(timeZone);
  const classification = workspaceTaskClassificationForRole(creatorRole);
  const createdForPush: { id: string; title: string; assigneeUserId: string }[] = [];

  for (const task of tasks) {
    const dueDate =
      task.dueDate && !Number.isNaN(Date.parse(task.dueDate))
        ? parseCalendarDueDate(task.dueDate, tz)
        : null;
    const baseData = {
      title: task.title.trim(),
      description: task.description?.trim() || null,
      ...classification,
      priority: "medium",
      status: "todo",
      dueDate,
      teamId,
      creatorId,
      assignments: { create: [{ userId: task.assigneeUserId }] },
    };

    try {
      const created = await prisma.task.create({
        data: {
          ...baseData,
          oneOnOneMeetingId: meetingId,
        },
      });
      createdForPush.push({ id: created.id, title: created.title, assigneeUserId: task.assigneeUserId });
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
      createdForPush.push({ id: created.id, title: created.title, assigneeUserId: task.assigneeUserId });
    }
  }

  for (const created of createdForPush) {
    if (created.assigneeUserId === creatorId) continue;
    await sendPushToUsers(
      [created.assigneeUserId],
      "New task assigned",
      created.title,
      { taskId: created.id, teamId, type: "task_assigned" },
      "notifTaskAssigned",
      teamId,
    );
  }
}

function followUpTaskKey(title: string, assigneeUserId: string): string {
  return `${title.trim().toLowerCase()}::${assigneeUserId}`;
}

/** Create only follow-ups that are not already linked to this check-in (avoids duplicates on re-save). */
async function syncFollowUpTasks(
  meetingId: string,
  teamId: string,
  creatorId: string,
  tasks: z.infer<typeof followUpTaskSchema>[],
  timeZone: string | null | undefined,
  creatorRole: string,
) {
  if (tasks.length === 0) return;
  const existing = await loadFollowUpTasks(meetingId);
  const existingKeys = new Set(
    existing
      .map((task) => {
        const assigneeId = task.assignee?.id;
        if (!assigneeId) return null;
        return followUpTaskKey(task.title, assigneeId);
      })
      .filter((key): key is string => Boolean(key)),
  );
  const toCreate = tasks.filter((task) => {
    const title = task.title.trim();
    if (!title) return false;
    return !existingKeys.has(followUpTaskKey(title, task.assigneeUserId));
  });
  await createFollowUpTasks(meetingId, teamId, creatorId, toCreate, timeZone, creatorRole);
}

function plannedOneOnOneTitle(memberName: string): string {
  return checkInEventTitle(memberName);
}

async function validateMeetingProvenance(
  callerUserId: string,
  teamId: string,
  memberUserId: string,
  provenance: {
    sourceVideoRoomId?: string | null;
    calendarEventId?: string | null;
  },
): Promise<
  | { ok: true; calendarEventId: string | null | undefined }
  | { ok: false; message: string }
> {
  try {
    const sourceContext = provenance.sourceVideoRoomId
      ? await resolveVideoCheckInContext(
          prisma,
          callerUserId,
          provenance.sourceVideoRoomId,
        )
      : null;
    if (
      sourceContext &&
      !contextIncludesCheckInSelection(sourceContext, teamId, memberUserId)
    ) {
      return {
        ok: false,
        message:
          "The selected member and workspace are not eligible for this video room.",
      };
    }

    const linkedCalendarEventId =
      sourceContext?.calendarEventId ?? provenance.calendarEventId;
    if (
      provenance.calendarEventId &&
      sourceContext?.calendarEventId &&
      provenance.calendarEventId !== sourceContext.calendarEventId
    ) {
      return {
        ok: false,
        message: "The calendar event does not match this video room.",
      };
    }

    if (
      provenance.calendarEventId &&
      provenance.calendarEventId !== sourceContext?.calendarEventId
    ) {
      const calendarContext = await resolveVideoCheckInContext(
        prisma,
        callerUserId,
        provenance.calendarEventId,
      );
      if (
        !contextIncludesCheckInSelection(
          calendarContext,
          teamId,
          memberUserId,
        )
      ) {
        return {
          ok: false,
          message:
            "The selected member and workspace are not eligible for this calendar event.",
        };
      }
    }

    return { ok: true, calendarEventId: linkedCalendarEventId };
  } catch (error) {
    if (error instanceof VideoRoomAccessError) {
      return { ok: false, message: error.message };
    }
    throw error;
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

  const isSelf = memberUserId === user.id;
  if (!isSelf && !canManageOneOnOne(membership)) {
    return c.json({ error: { message: "Only workspace owners and team leaders can view planned check-ins.", code: "FORBIDDEN" } }, 403);
  }

  if (!isSelf) {
    const access = await resolveCheckInMemberAccess(membership, teamId, memberUserId, {});
    if (!access.ok || access.isFormer) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }
  } else {
    const active = await isActiveTeamMember(prisma, teamId, memberUserId);
    if (!active) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }
  }

  try {
    const now = Date.now();
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: memberUserId, teamId } },
      include: { user: { select: { name: true, email: true } } },
    });
    const memberLabel = member?.user.name?.trim() || member?.user.email?.split("@")[0] || "";
    const legacyTitles = memberLabel ? plannedCheckInTitlesForMember(memberLabel) : [];
    const plannedTypeFilter = {
      OR: [
        { isOneOnOne: true },
        ...PLANNED_CHECK_IN_TITLE_PREFIXES.map((prefix) => ({ title: { startsWith: prefix } })),
      ],
    };

    const events = await prisma.calendarEvent.findMany({
      where: isSelf
        ? {
            teamId,
            AND: [
              plannedTypeFilter,
              {
                OR: [
                  { oneOnOneMemberUserId: memberUserId },
                  ...legacyTitles.map((title) => ({ title })),
                ],
              },
            ],
          }
        : {
            teamId,
            createdById: user.id,
            OR: [
              { oneOnOneMemberUserId: memberUserId },
              ...legacyTitles.map((title) => ({ title })),
            ],
            AND: [plannedTypeFilter],
          },
      orderBy: { startDate: "asc" },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

    const upcoming = events.filter((event) => {
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
        createdById: event.createdById,
        createdBy: event.createdBy
          ? { id: event.createdBy.id, name: event.createdBy.name, image: event.createdBy.image }
          : null,
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
    const provenance = await validateMeetingProvenance(
      user.id,
      teamId,
      memberUserId,
      body,
    );
    if (!provenance.ok) {
      return c.json(
        {
          error: {
            message: provenance.message,
            code: "INVALID_VIDEO_CHECK_IN_CONTEXT",
          },
        },
        403,
      );
    }

    try {
      const meeting = await prisma.$transaction(async (tx) => {
        const created = await tx.oneOnOneMeeting.create({
          data: {
            teamId,
            memberUserId,
            sourceVideoRoomId: body.sourceVideoRoomId ?? null,
            calendarEventId: provenance.calendarEventId ?? null,
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
              ...workspaceTaskClassificationForRole(membership.role),
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

      if (
        !isDraft &&
        body.plannedCalendarEventId &&
        (await shouldRemovePlannedEventAfterPublish(
          body.plannedCalendarEventId,
          teamId,
        ))
      ) {
        await removePlannedCheckInCalendarEvent(prisma, {
          eventId: body.plannedCalendarEventId,
          teamId,
          memberUserId,
          actorUserId: user.id,
          actorRole: membership.role,
        });
      }

      const managerName = user.name?.trim() || user.email || "Your manager";
      if (!isDraft) {
        await createMeetingAssociateFeedbackRequest(
          meeting,
          body.requestAssociateFeedback === true,
          body.responses,
          user.id,
          managerName,
          membership.role,
        );
      }

      await publishTeamCheckInsUpdated(teamId);
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
    const provenance = await validateMeetingProvenance(
      user.id,
      teamId,
      memberUserId,
      body,
    );
    if (!provenance.ok) {
      return c.json(
        {
          error: {
            message: provenance.message,
            code: "INVALID_VIDEO_CHECK_IN_CONTEXT",
          },
        },
        403,
      );
    }

    const publishingNow = existing.status === "draft" && nextStatus === "published";

    try {
      await prisma.oneOnOneMeeting.update({
        where: { id: meetingId },
        data: {
          responses: JSON.stringify(body.responses),
          status: nextStatus,
          ...(body.sourceVideoRoomId !== undefined
            ? { sourceVideoRoomId: body.sourceVideoRoomId }
            : {}),
          ...(provenance.calendarEventId !== undefined
            ? { calendarEventId: provenance.calendarEventId }
            : {}),
          ...(publishingNow ? { publishedAt: new Date() } : {}),
        },
      });

      if (followUpTasks.length > 0) {
        await syncFollowUpTasks(meetingId, teamId, user.id, followUpTasks, user.timezone, membership.role);
      }

      const managerName = user.name?.trim() || user.email || "Your manager";
      if (!isDraft) {
        await createMeetingAssociateFeedbackRequest(
          { id: meetingId, teamId, memberUserId, templateTitle: existing.templateTitle },
          body.requestAssociateFeedback === true,
          body.responses,
          user.id,
          managerName,
          membership.role,
        );
      }

      if (
        publishingNow &&
        body.plannedCalendarEventId &&
        (await shouldRemovePlannedEventAfterPublish(
          body.plannedCalendarEventId,
          teamId,
        ))
      ) {
        await removePlannedCheckInCalendarEvent(prisma, {
          eventId: body.plannedCalendarEventId,
          teamId,
          memberUserId,
          actorUserId: user.id,
          actorRole: membership.role,
        });
      }

      const meeting = await prisma.oneOnOneMeeting.findUnique({
        where: { id: meetingId },
        include: meetingInclude,
      });
      if (!meeting) {
        return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
      }
      await publishTeamCheckInsUpdated(teamId);
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
    await completeFeedbackTasks(meetingId, body.fieldId, user.id);

    const updated = await prisma.oneOnOneMeeting.findUnique({
      where: { id: meetingId },
      include: meetingInclude,
    });
    if (!updated) {
      return c.json({ error: { message: "Check-in not found", code: "NOT_FOUND" } }, 404);
    }

    await publishTeamCheckInsUpdated(teamId);
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
    await publishTeamCheckInsUpdated(teamId);
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] DELETE failed");
  }
});

export { oneOnOneMeetingsRouter };
