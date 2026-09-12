import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { publishTeamTaskUpdated, type TaskUpdatedReason } from "../lib/realtime-hub";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { getTeamSubscription, teamSubscriptionRowHasTeamFeatures } from "./subscription";
import { logActivity } from "../lib/activity";
import { isFeedbackTaskDescription } from "../lib/one-on-one-feedback";
import {
  alignRecurringAnchorDueDate,
  createRecurrenceSeries,
  deleteTaskWithScope,
  getNextDueDate,
  isRecurringTask,
  materializeRecurringTasksForTeam,
  parseCalendarDueDate,
  resolveRecurrenceOccurrenceCount,
  spawnAllRecurrenceTasks,
  updateTaskWithSeriesScope,
  type RecurrenceScope,
} from "../lib/recurrence-series";
import { isValidTimeZone, resolveTimeZone } from "../lib/timezone";
import { normalizeTaskStatus } from "../lib/task-status";
import { archiveCutoffDate, archiveOldCompletedTasksForTeam } from "../lib/task-archive";
import { deleteStorageObjectByUrlIfOwned } from "../lib/firebase-storage";
import {
  buildDevelopmentGoalActivityAlerts,
  reconcileInactiveDevelopmentGoals,
} from "../lib/development-goal-activity";
import { oneOnOnePublishedAt } from "../lib/one-on-one-meeting-dates";
import {
  computeMemberStandardsCompliance,
  parseWorkplaceStandards,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";
import { canManageWorkspaceTasks } from "../lib/workspace-role-policy";
import {
  applyMomentumCompletion,
  revokeMomentumCompletion,
  withSerializableMomentumTransaction,
  type MomentumLifecycleResult,
} from "../lib/momentum-service";
import {
  canAccessTask,
  canMutateTask,
  REMINDER_ASSIGNMENT_LOCKED,
  REMINDER_CREATOR_REQUIRED,
  resolveTaskCreationPolicy,
  TASK_ASSIGNEE_INVALID,
  TASK_KIND_INVALID,
  taskVisibilityWhere,
  workspaceTaskWhere,
} from "../lib/task-policy";
import { isSubtaskSharedComplete } from "../lib/subtask-completion";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const tasksRouter = new Hono<{ Variables: Variables }>();
tasksRouter.use("*", authGuard);

const subtasksInclude = {
  orderBy: { order: "asc" as const },
  include: {
    completions: {
      include: { user: { select: { id: true, name: true, image: true } } },
    },
  },
};

// Check membership helper
async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

const taskNoteAuthorSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

function validateTaskNoteBody(value: unknown): { body: string } | { error: string } {
  if (typeof value !== "string" || !value.trim()) return { error: "Note is required" };
  const body = value.trim();
  if (body.length > 5000) return { error: "Note must be 5,000 characters or fewer" };
  return { body };
}

function canModerateTaskNote(
  role: string,
  userId: string,
  taskCreatorId: string,
  noteCreatorId: string,
): boolean {
  return (
    noteCreatorId === userId ||
    taskCreatorId === userId ||
    canManageWorkspaceTasks(role)
  );
}

function emitTaskChange(
  teamId: string,
  taskId: string,
  reason: TaskUpdatedReason,
  actorUserId: string,
) {
  publishTeamTaskUpdated({ teamId, taskId, reason, actorUserId });
}

type RecurrenceBody = {
  type: string;
  occurrenceCount?: number;
  /** @deprecated Use occurrenceCount */
  interval?: number;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
  timeZone?: string | null;
};

async function getUserTimeZone(userId: string, bodyTimeZone?: unknown): Promise<string> {
  if (typeof bodyTimeZone === "string" && isValidTimeZone(bodyTimeZone)) return bodyTimeZone;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return resolveTimeZone(user?.timezone);
}

async function buildRecurrenceTaskFields(
  taskSeed: {
    teamId: string;
    creatorId: string;
    title: string;
    description?: string | null;
    priority: string;
    incognito: boolean;
    isJoint: boolean;
    attachmentUrl?: string | null;
    kind: "workspace_task" | "reminder";
    momentumEligible: boolean;
  },
  recurrence: RecurrenceBody | undefined,
  dueDate: string | null | undefined,
  timeZone: string,
) {
  if (!recurrence) return {};

  const occurrenceCount = resolveRecurrenceOccurrenceCount(recurrence);
  const series = await createRecurrenceSeries(
    prisma,
    {
      ...taskSeed,
      description: taskSeed.description ?? null,
      attachmentUrl: taskSeed.attachmentUrl ?? null,
    },
    { ...recurrence, timeZone },
  );
  const anchor =
    dueDate != null
      ? alignRecurringAnchorDueDate(
          recurrence.type,
          parseCalendarDueDate(dueDate, timeZone),
          recurrence.daysOfWeek,
          recurrence.dayOfMonth,
          timeZone,
        )
      : null;
  return {
    recurrenceSeriesId: series.id,
    recurrenceRule: {
      create: {
        type: recurrence.type,
        interval: occurrenceCount,
        daysOfWeek: recurrence.daysOfWeek,
        dayOfMonth: recurrence.dayOfMonth,
        nextDueAt: anchor
          ? getNextDueDate(recurrence.type, 1, anchor, recurrence.daysOfWeek, recurrence.dayOfMonth, timeZone)
          : null,
      },
    },
  };
}

function parseRecurrenceScope(raw: unknown): RecurrenceScope {
  return raw === "series" ? "series" : "task";
}

// GET /api/teams/:teamId/tasks
tasksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const { status, priority, assigneeId, creatorId, myTasks, cursor, dueYear, dueMonth, completedYear, completedMonth, recurrenceSeriesId } =
    c.req.query();
  const archivedOnly = c.req.query("archived") === "true";
  const rawLimit = Number(c.req.query("limit") ?? 50);
  const maxLimit = recurrenceSeriesId ? 400 : 200;
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, maxLimit);

  const resolvedAssigneeId = assigneeId === "me" ? user.id : assigneeId;

  const monthBounds = (year: number, month: number) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { monthStart, monthEnd };
  };

  const monthFilters: Record<string, unknown>[] = [];
  if (!recurrenceSeriesId && dueYear && dueMonth !== undefined) {
    const y = parseInt(dueYear, 10);
    const m = parseInt(dueMonth, 10);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      const { monthStart, monthEnd } = monthBounds(y, m);
      const now = new Date();
      const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();
      monthFilters.push({
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          ...(isCurrentMonth ? [{ dueDate: null }] : []),
        ],
      });
    }
  }
  if (!recurrenceSeriesId && completedYear && completedMonth !== undefined) {
    const y = parseInt(completedYear, 10);
    const m = parseInt(completedMonth, 10);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      const { monthStart, monthEnd } = monthBounds(y, m);
      monthFilters.push({ completedAt: { gte: monthStart, lte: monthEnd } });
    }
  }

  const activeOnly = c.req.query("activeOnly") === "true";
  const listingCompleted =
    status === "done" || (!!completedYear && completedMonth !== undefined) || archivedOnly;

  if (!cursor || activeOnly || recurrenceSeriesId || listingCompleted) {
    await materializeRecurringTasksForTeam(prisma, teamId);
  }

  if (listingCompleted || archivedOnly) {
    await archiveOldCompletedTasksForTeam(prisma, teamId);
  }

  const searchQ = (c.req.query("q") ?? "").trim();
  const isPersonalListing =
    Boolean(recurrenceSeriesId) ||
    myTasks === "true" ||
    resolvedAssigneeId === user.id ||
    creatorId === "me" ||
    creatorId === user.id;

  if (recurrenceSeriesId) {
    const series = await prisma.recurrenceSeries.findFirst({
      where: { id: recurrenceSeriesId, teamId },
      select: { id: true },
    });
    if (!series) {
      return c.json({ error: { message: "Recurrence series not found", code: "NOT_FOUND" } }, 404);
    }
    const seriesRow = await prisma.recurrenceSeries.findUnique({
      where: { id: recurrenceSeriesId },
      select: { kind: true, creatorId: true },
    });
    if (seriesRow && !canAccessTask(seriesRow, user.id)) {
      return c.json({ error: { message: "Recurrence series not found", code: "NOT_FOUND" } }, 404);
    }
  }

  // Archive is search-first — don't dump every old task without a query.
  if (archivedOnly && !searchQ && !recurrenceSeriesId) {
    return c.json({ data: { tasks: [], nextCursor: null } });
  }

  const tasks = await prisma.task.findMany({
    where: {
      teamId,
      ...(recurrenceSeriesId ? { recurrenceSeriesId } : {}),
      ...(status
        ? { status }
        : !recurrenceSeriesId && activeOnly
          ? { status: { not: "done" } }
          : {}),
      // Series chain shows all occurrences. Completed list hides archived unless requested.
      // Archive search: must be archived AND completed at least 30 days ago.
      ...(!recurrenceSeriesId
        ? archivedOnly
          ? {
              status: "done",
              archivedAt: { not: null },
              completedAt: { lte: archiveCutoffDate() },
            }
          : listingCompleted
            ? { archivedAt: null }
            : {}
        : {}),
      ...(priority ? { priority } : {}),
      ...(!recurrenceSeriesId && myTasks === "true" ? {
        OR: [
          { assignments: { some: { userId: user.id } } },
          { creatorId: user.id, assignments: { none: {} } },
        ],
      } : {}),
      ...(!recurrenceSeriesId && resolvedAssigneeId
        ? {
            assignments: { some: { userId: resolvedAssigneeId } },
            ...(resolvedAssigneeId !== user.id ? workspaceTaskWhere : {}),
          }
        : {}),
      // "me" is a shorthand that resolves to the authenticated user's ID
      ...(!recurrenceSeriesId && creatorId ? { creatorId: creatorId === "me" ? user.id : creatorId } : {}),
      AND: [
        isPersonalListing ? taskVisibilityWhere(user.id) : workspaceTaskWhere,
        ...monthFilters,
      ],
      ...(searchQ
        ? {
            title: { contains: searchQ, mode: "insensitive" as const },
          }
        : {}),
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      subtasks: subtasksInclude,
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true, image: true } },
      oneOnOneMeeting: {
        select: {
          id: true,
          memberUserId: true,
          createdById: true,
          templateTitle: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const lastTask = tasks.length === limit ? tasks[tasks.length - 1] : undefined;
  const nextCursor = lastTask?.id ?? null;

  return c.json({ data: { tasks, nextCursor } });
});

// POST /api/teams/:teamId/tasks
tasksRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const body = await c.req.json();
  const { title, description, priority, dueDate, status, assigneeIds, recurrence, attachmentUrl, incognito, isJoint, subtasks, timeZone: bodyTimeZone } = body;

  const creationPolicy = resolveTaskCreationPolicy({
    requestedKind: body.kind,
    creatorId: user.id,
    creatorRole: membership.role,
    requestedAssigneeIds: assigneeIds,
    requestedIncognito: incognito,
    requestedIsJoint: isJoint,
  });
  if (!creationPolicy.ok) {
    const status = creationPolicy.code === TASK_KIND_INVALID ? 400 : 403;
    return c.json({ error: { message: creationPolicy.message, code: creationPolicy.code } }, status);
  }
  const { classification } = creationPolicy;
  const ids = creationPolicy.assigneeIds;
  const effectiveIncognito = creationPolicy.incognito;
  const effectiveIsJoint = creationPolicy.isJoint;

  if (classification.kind === "workspace_task") {
    const subscription = await getTeamSubscription(teamId);
    if (!teamSubscriptionRowHasTeamFeatures(subscription)) {
      return c.json({ error: { message: "Task manager requires a Pro or Operations plan", code: "SUBSCRIPTION_REQUIRED" } }, 403);
    }
    if (ids.length > 0) {
      const activeAssignees = await prisma.teamMember.findMany({
        where: { teamId, userId: { in: ids } },
        select: { userId: true },
      });
      if (activeAssignees.length !== ids.length) {
        return c.json(
          { error: { message: "Workspace tasks may only be assigned to active workspace members", code: TASK_ASSIGNEE_INVALID } },
          400,
        );
      }
    }
  }

  if (!title?.trim()) {
    return c.json({ error: { message: "Title is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const userTimeZone = await getUserTimeZone(user.id, bodyTimeZone);

  const taskInclude = {
    assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
    subtasks: subtasksInclude,
    recurrenceRule: true,
    creator: { select: { id: true, name: true, email: true, image: true } },
  } as const;
  type CreatedTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
  const completionMomentumByTaskId = new Map<string, MomentumLifecycleResult>();
  const createTask = async (args: { data: Prisma.TaskCreateArgs["data"] }): Promise<CreatedTask> => {
    if (normalizedStatus !== "done") {
      return prisma.task.create({ data: args.data, include: taskInclude });
    }
    return withSerializableMomentumTransaction(prisma, async (tx) => {
      const task = await tx.task.create({ data: args.data, include: taskInclude });
      const momentum = await applyMomentumCompletion(tx, {
        taskId: task.id,
        actorUserId: user.id,
        completedAt: task.completedAt ?? new Date(),
      });
      completionMomentumByTaskId.set(task.id, momentum);
      return task;
    });
  };

  const dueDateObj = dueDate
    ? recurrence
      ? alignRecurringAnchorDueDate(
          recurrence.type,
          parseCalendarDueDate(dueDate, userTimeZone),
          recurrence.daysOfWeek,
          recurrence.dayOfMonth,
          userTimeZone,
        )
      : parseCalendarDueDate(dueDate, userTimeZone)
    : null;
  const normalizedStatus = status ? normalizeTaskStatus(status) : "todo";

  const subtaskList: { title: string; order: number }[] = Array.isArray(subtasks)
    ? subtasks.map((s: { title: string }, i: number) => ({ title: s.title.trim(), order: i }))
    : [];

  const baseTaskData = {
    title: title.trim(),
    description: description?.trim(),
    priority: priority || "medium",
    status: normalizedStatus,
    ...(normalizedStatus === "done" ? { completedAt: new Date() } : {}),
    dueDate: dueDateObj,
    incognito: effectiveIncognito,
    kind: classification.kind,
    momentumEligible: classification.momentumEligible,
    teamId,
    creatorId: user.id,
    ...(attachmentUrl ? { attachmentUrl } : {}),
  };

  const taskSeed = {
    teamId,
    creatorId: user.id,
    title: title.trim(),
    description: description?.trim() ?? null,
    priority: priority || "medium",
    incognito: effectiveIncognito,
    isJoint: effectiveIsJoint,
    attachmentUrl: attachmentUrl ?? null,
    kind: classification.kind,
    momentumEligible: classification.momentumEligible,
  };

  let tasks: CreatedTask[];

  if (effectiveIsJoint && ids.length > 1) {
    // Joint task: one task shared by all assignees
    const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
    const task = await createTask({
      data: {
        ...baseTaskData,
        ...recurrenceFields,
        isJoint: true,
        assignments: { create: ids.map((uid: string) => ({ userId: uid })) },
        ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
      },
    });
    tasks = [task];
  } else if (ids.length <= 1) {
    // Single task (0 or 1 assignee)
    const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
    const task = await createTask({
      data: {
        ...baseTaskData,
        ...recurrenceFields,
        ...(ids.length === 1 ? { assignments: { create: [{ userId: ids[0]! }] } } : {}),
        ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
      },
    });
    tasks = [task];
  } else {
    // One task per assignee (existing behavior)
    tasks = await Promise.all(
      ids.map(async (assigneeId) => {
        const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
        return createTask({
          data: {
            ...baseTaskData,
            ...recurrenceFields,
            assignments: { create: [{ userId: assigneeId }] },
            ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
          },
        });
      }),
    );
  }

  if (normalizedStatus === "done" && classification.kind === "workspace_task") {
    for (const task of tasks) {
      const completedAt = task.completedAt ?? new Date();
      const momentum = completionMomentumByTaskId.get(task.id);
      await logActivity({
        teamId,
        userId: user.id,
        type: "task_completed",
        metadata: {
          taskId: task.id,
          idempotencyKey: `task_completed:${teamId}:${task.id}:${completedAt.toISOString()}`,
          momentumCreditIds: momentum?.creditIds ?? [],
          taskTitle: task.incognito ? null : task.title,
          dueDate: task.dueDate?.toISOString() ?? null,
          completedAt: completedAt.toISOString(),
          completedOnTime: task.dueDate ? completedAt <= task.dueDate : null,
          assignees: (task as typeof task & {
            assignments: Array<{ userId: string; user: { name: string | null; image: string | null } }>;
          }).assignments.map((assignment) => ({
            id: assignment.userId,
            name: assignment.user.name,
            image: assignment.user.image ?? null,
          })),
        },
      });
    }
  }

  // Send push notifications to assignees (excluding the creator)
  const assigneesToNotify =
    classification.kind === "workspace_task" ? ids.filter((id) => id !== user.id) : [];
  if (assigneesToNotify.length > 0) {
    await sendPushToUsers(
      assigneesToNotify,
      "New task assigned",
      tasks[0]?.title ?? "You have a new task",
      { taskId: tasks[0]?.id, teamId },
      "notifTaskAssigned",
      teamId
    );
  }

  // Log activity for each assignee
  const assignedUsersForLog = await prisma.user.findMany({
    where: { id: { in: classification.kind === "workspace_task" ? ids : [] } },
    select: { id: true, name: true },
  });
  const userNameMapForLog = Object.fromEntries(assignedUsersForLog.map((u) => [u.id, u.name ?? ""]));
  for (const assigneeId of classification.kind === "workspace_task" ? ids : []) {
    await logActivity({
      teamId,
      userId: assigneeId,
      type: "task_assigned",
      metadata: { taskTitles: effectiveIncognito ? [] : [title.trim()], taskCount: 1, assigneeName: userNameMapForLog[assigneeId] ?? "" },
    });
  }

  if (recurrence) {
    for (const task of tasks) {
      if (!isRecurringTask(task)) continue;
      const taskAssigneeIds =
        "assignments" in task && Array.isArray(task.assignments)
          ? task.assignments.map((a: { userId: string }) => a.userId)
          : ids;
      try {
        await spawnAllRecurrenceTasks(prisma, task, taskAssigneeIds);
      } catch (err) {
        console.error("[tasks] spawnAllRecurrenceTasks failed:", err);
        throw err;
      }
    }
  }

  for (const task of tasks) {
    emitTaskChange(teamId, task.id, "created", user.id);
  }

  return c.json({ data: tasks }, 201);
});

// GET /api/teams/:teamId/tasks/member-stats - task stats per team member
// MUST be before /:taskId routes so Hono doesn't match "member-stats" as a taskId
tasksRouter.get("/member-stats", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const teamRow = await prisma.team.findUnique({
    where: { id: teamId },
    select: { workplaceStandards: true },
  });
  const workplaceStandards = parseWorkplaceStandards(teamRow?.workplaceStandards);

  const now = new Date();

  // Accept optional year/month query params (month is 0-indexed)
  const yearParam = c.req.query("year");
  const monthParam = c.req.query("month");
  const targetYear = yearParam ? parseInt(yearParam) : now.getFullYear();
  const targetMonth = monthParam !== undefined ? parseInt(monthParam) : now.getMonth();

  // Fetch all assigned tasks for this team in one query
  const assignments = await prisma.taskAssignment.findMany({
    where: { task: { teamId, ...workspaceTaskWhere } },
    include: {
      task: {
        select: {
          status: true,
          dueDate: true,
          completedAt: true,
          oneOnOneMeetingId: true,
          oneOnOneMeeting: { select: { status: true } },
        },
      },
    },
  });

  // Fetch stored streaks from TeamMember (persists through task deletion)
  const teamMembers = await prisma.teamMember.findMany({
    where: { teamId },
    select: {
      userId: true,
      currentStreak: true,
      personalBestStreak: true,
      user: { select: { name: true, email: true } },
    },
  });
  const storedStreaks: Record<string, number> = {};
  const storedPersonalBests: Record<string, number> = {};
  for (const m of teamMembers) {
    storedStreaks[m.userId] = m.currentStreak;
    storedPersonalBests[m.userId] = m.personalBestStreak;
  }

  // Group by userId
  const userTasks: Record<
    string,
    {
      status: string;
      dueDate: Date | null;
      completedAt: Date | null;
      oneOnOneMeetingId: string | null;
      oneOnOneMeeting: { status: string } | null;
    }[]
  > = {};
  for (const a of assignments) {
    if (!userTasks[a.userId]) userTasks[a.userId] = [];
    userTasks[a.userId]!.push(a.task);
  }

  const statsMap: Record<
    string,
    {
      activeTasks: number;
      overdueTasks: number;
      dueSoonTasks: number;
      completedTasks: number;
      streak: number;
      personalBestStreak: number;
      activeDevGoals: number;
      devEngagementPct: number;
      daysSinceLastOneOnOne: number | null;
      openFollowUpTasks: number;
      overdueFollowUpTasks: number;
      standardsCompliance: MemberStandardsCompliance;
    }
  > = {};

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  for (const [userId, tasks] of Object.entries(userTasks)) {
    let activeTasks = 0;
    let overdueTasks = 0;
    let dueSoonTasks = 0;
    let completedTasks = 0;
    let openFollowUpTasks = 0;
    let overdueFollowUpTasks = 0;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const t of tasks) {
      if (t.status !== "done") {
        activeTasks++;
        const isOverdue = !!(t.dueDate && t.dueDate < now);
        if (isOverdue) overdueTasks++;
        else if (t.dueDate) {
          const dueDay = new Date(t.dueDate.getFullYear(), t.dueDate.getMonth(), t.dueDate.getDate());
          const daysUntilDue = Math.round((dueDay.getTime() - todayStart.getTime()) / 86_400_000);
          // Due today through 3 days out (matches web TASK_DUE_SOON_DAYS = 3, includes today)
          if (daysUntilDue >= 0 && daysUntilDue <= 3) dueSoonTasks++;
        }
        const isCheckInFollowUp =
          !!t.oneOnOneMeetingId && t.oneOnOneMeeting?.status === "published";
        if (isCheckInFollowUp) {
          openFollowUpTasks++;
          if (isOverdue) overdueFollowUpTasks++;
        }
      } else {
        if (t.completedAt && t.completedAt >= monthStart && t.completedAt <= monthEnd) completedTasks++;
      }
    }

    // Use the stored streak (set at task completion time, survives task deletion)
    const streak = storedStreaks[userId] ?? 0;

    statsMap[userId] = {
      activeTasks,
      overdueTasks,
      dueSoonTasks,
      completedTasks,
      streak,
      personalBestStreak: storedPersonalBests[userId] ?? 0,
      activeDevGoals: 0,
      devEngagementPct: 0,
      daysSinceLastOneOnOne: null,
      openFollowUpTasks,
      overdueFollowUpTasks,
      standardsCompliance: computeMemberStandardsCompliance(workplaceStandards, null, 0),
    };
  }

  const emptyStats = (streak: number, personalBestStreak = 0) => ({
    activeTasks: 0,
    overdueTasks: 0,
    dueSoonTasks: 0,
    completedTasks: 0,
    streak,
    personalBestStreak,
    activeDevGoals: 0,
    devEngagementPct: 0,
    daysSinceLastOneOnOne: null as number | null,
    openFollowUpTasks: 0,
    overdueFollowUpTasks: 0,
    standardsCompliance: computeMemberStandardsCompliance(workplaceStandards, null, 0),
  });

  // Also include members with no tasks but a stored streak
  for (const m of teamMembers) {
    if (!statsMap[m.userId]) {
      statsMap[m.userId] = emptyStats(m.currentStreak, m.personalBestStreak);
    }
  }

  const [devGoals, oneOnOnes] = await Promise.all([
    prisma.developmentGoal.findMany({
      where: { teamId, status: { not: "closed" }, archivedAt: null },
      select: {
        id: true,
        memberUserId: true,
        skill: true,
        status: true,
        createdAt: true,
        lastActivityAt: true,
        notes: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.oneOnOneMeeting.findMany({
      where: { teamId, status: "published" },
      select: { memberUserId: true, createdAt: true, publishedAt: true, templateId: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const devGoalsForActivity = devGoals.map((goal) => ({
    ...goal,
    notes: goal.notes,
  }));
  const inactiveIds = await reconcileInactiveDevelopmentGoals(devGoalsForActivity, async (ids) => {
    await prisma.developmentGoal.updateMany({
      where: { id: { in: ids } },
      data: { status: "inactive" },
    });
  });
  const devGoalsWithStatus = devGoalsForActivity.map((goal) =>
    inactiveIds.has(goal.id) ? { ...goal, status: "inactive" } : goal,
  );

  const devByMember: Record<string, { active: number; engaged: number }> = {};
  for (const goal of devGoalsWithStatus) {
    if (goal.status === "closed") continue;
    const bucket = devByMember[goal.memberUserId] ?? { active: 0, engaged: 0 };
    if (goal.status === "active") {
      bucket.active += 1;
      if (goal.notes.length > 0) bucket.engaged += 1;
    }
    devByMember[goal.memberUserId] = bucket;
  }

  const memberNameByUserId = new Map(
    teamMembers.map((m) => [m.userId, m.user.name ?? m.user.email ?? "Team member"]),
  );

  const goalAlerts = buildDevelopmentGoalActivityAlerts(devGoalsWithStatus);
  const developmentGoalAlerts = {
    nearingInactive: goalAlerts.nearingInactive.map((alert) => ({
      ...alert,
      memberName: memberNameByUserId.get(alert.memberUserId) ?? "Team member",
    })),
    inactive: goalAlerts.inactive.map((alert) => ({
      ...alert,
      memberName: memberNameByUserId.get(alert.memberUserId) ?? "Team member",
    })),
  };

  const lastOneOnOneByMember: Record<string, Date> = {};
  const requiredTemplateId = workplaceStandards.requiredCheckInTemplateId;
  for (const meeting of oneOnOnes) {
    if (requiredTemplateId && meeting.templateId !== requiredTemplateId) continue;
    if (!lastOneOnOneByMember[meeting.memberUserId]) {
      const publishedAt = oneOnOnePublishedAt(meeting);
      if (publishedAt) lastOneOnOneByMember[meeting.memberUserId] = publishedAt;
    }
  }

  const daysSinceCalendar = (then: Date): number => {
    const now = new Date();
    const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startOfThenUtc = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
    return Math.max(0, Math.floor((startOfTodayUtc - startOfThenUtc) / 86_400_000));
  };

  for (const m of teamMembers) {
    const row = statsMap[m.userId] ?? emptyStats(m.currentStreak);
    const dev = devByMember[m.userId] ?? { active: 0, engaged: 0 };
    const lastMeeting = lastOneOnOneByMember[m.userId];
    row.activeDevGoals = dev.active;
    row.devEngagementPct =
      dev.active === 0 ? 0 : Math.round((dev.engaged / dev.active) * 100);
    row.daysSinceLastOneOnOne = lastMeeting ? daysSinceCalendar(lastMeeting) : null;
    row.standardsCompliance = computeMemberStandardsCompliance(
      workplaceStandards,
      row.daysSinceLastOneOnOne,
      row.activeDevGoals,
    );
    statsMap[m.userId] = row;
  }

  return c.json({ data: { stats: statsMap, workplaceStandards }, developmentGoalAlerts });
});

// GET /api/teams/:teamId/tasks/count - returns count of todo/in-progress tasks assigned to current user
// MUST be before /:taskId routes so Hono doesn't match "count" as a taskId
tasksRouter.get("/count", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const count = await prisma.taskAssignment.count({
    where: {
      userId: user.id,
      task: {
        teamId,
        status: { not: "done" },
        ...taskVisibilityWhere(user.id),
      },
    },
  });

  return c.json({ data: count });
});

// GET /api/teams/:teamId/tasks/monthly-completion
// Returns task completion percentage for each of the last 6 calendar months
// MUST be before /:taskId routes so Hono doesn't match "monthly-completion" as a taskId
tasksRouter.get("/monthly-completion", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Build last 6 calendar months (inclusive of current month)
  const months: Array<{ year: number; month: number; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const rawMonth = currentMonth - i;
    const year = currentYear + Math.floor(rawMonth / 12);
    const month = ((rawMonth % 12) + 12) % 12;
    const label = new Date(year, month, 1).toLocaleString("en-US", { month: "short" });
    months.push({ year, month, label });
  }

  // Start of the earliest month, end of the current month
  const earliest = months[0]!;
  const sixMonthsAgo = new Date(earliest.year, earliest.month, 1);
  const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Use immutable completion events so deleting tasks does not erase history.
  const completionActivities = await prisma.teamActivity.findMany({
    where: {
      teamId,
      type: "task_completed",
      createdAt: { gte: sixMonthsAgo, lte: endOfCurrentMonth },
    },
    select: { createdAt: true, metadata: true },
  });

  // Group completion events by completion month key.
  // total = all completions, done = on-time completions.
  const grouped: Record<string, { total: number; done: number }> = {};
  for (const activity of completionActivities) {
    const d = new Date(activity.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!grouped[key]) grouped[key] = { total: 0, done: 0 };
    grouped[key]!.total++;

    let completedOnTime: boolean | null = null;
    if (activity.metadata) {
      try {
        const meta = JSON.parse(activity.metadata) as {
          completedOnTime?: boolean;
          dueDate?: string | null;
          completedAt?: string | null;
        };

        if (typeof meta.completedOnTime === "boolean") {
          completedOnTime = meta.completedOnTime;
        } else if (meta.completedAt && meta.dueDate) {
          completedOnTime = new Date(meta.completedAt) <= new Date(meta.dueDate);
        }
      } catch {
        completedOnTime = null;
      }
    }

    // Legacy completion events without timing metadata default to on-time.
    if (completedOnTime !== false) grouped[key]!.done++;
  }

  const result = months.map(({ year, month, label }) => {
    const key = `${year}-${month}`;
    const bucket = grouped[key];
    const completionPct =
      bucket === undefined || bucket.total === 0
        ? null
        : Math.round((bucket.done / bucket.total) * 100);
    return { label, year, month, completionPct, done: bucket?.done ?? 0, total: bucket?.total ?? 0 };
  });

  return c.json({ data: result });
});

// GET /api/teams/:teamId/tasks/:taskId/notes
tasksRouter.get("/:taskId/notes", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    select: { id: true, kind: true, creatorId: true },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canAccessTask(task, user.id)) {
    return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  }

  const notes = await prisma.taskNote.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: taskNoteAuthorSelect } },
  });

  return c.json({ data: notes });
});

// POST /api/teams/:teamId/tasks/:taskId/notes
tasksRouter.post("/:taskId/notes", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    select: {
      id: true,
      title: true,
      incognito: true,
      creatorId: true,
      kind: true,
      assignments: { select: { userId: true } },
    },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can add notes", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }

  const isParticipant =
    task.creatorId === user.id ||
    task.assignments.some((assignment) => assignment.userId === user.id) ||
    canManageWorkspaceTasks(membership.role);
  if (!isParticipant) {
    return c.json(
      {
        error: {
          message: "Only the task creator, an assignee, or a workspace leader can add notes",
          code: "FORBIDDEN",
        },
      },
      403,
    );
  }

  const payload = (await c.req.json().catch(() => null)) as { body?: unknown } | null;
  const validated = validateTaskNoteBody(payload?.body);
  if ("error" in validated) {
    return c.json({ error: { message: validated.error, code: "VALIDATION_ERROR" } }, 400);
  }

  const note = await prisma.taskNote.create({
    data: { taskId, body: validated.body, createdById: user.id },
    include: { createdBy: { select: taskNoteAuthorSelect } },
  });

  const recipientIds = [
    ...new Set([task.creatorId, ...task.assignments.map((assignment) => assignment.userId)]),
  ].filter((id) => id !== user.id);
  if (recipientIds.length > 0) {
    const notificationBody = task.incognito
      ? "A new note was added to a private task."
      : `${task.title}: ${validated.body.slice(0, 120)}`;
    void sendPushToUsers(
      recipientIds,
      user.name ?? "Task update",
      notificationBody,
      { taskId, teamId, type: "task_note_added" },
      "notifTaskAssigned",
      teamId,
    );
  }

  emitTaskChange(teamId, taskId, "notes", user.id);
  return c.json({ data: note }, 201);
});

// PATCH /api/teams/:teamId/tasks/:taskId/notes/:noteId
tasksRouter.patch("/:taskId/notes/:noteId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId, noteId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    select: { id: true, creatorId: true, kind: true },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can edit notes", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }

  const existing = await prisma.taskNote.findFirst({ where: { id: noteId, taskId } });
  if (!existing) return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
  if (!canModerateTaskNote(membership.role, user.id, task.creatorId, existing.createdById)) {
    return c.json({ error: { message: "You cannot edit this note", code: "FORBIDDEN" } }, 403);
  }

  const payload = (await c.req.json().catch(() => null)) as { body?: unknown } | null;
  const validated = validateTaskNoteBody(payload?.body);
  if ("error" in validated) {
    return c.json({ error: { message: validated.error, code: "VALIDATION_ERROR" } }, 400);
  }

  const note = await prisma.taskNote.update({
    where: { id: noteId },
    data: { body: validated.body },
    include: { createdBy: { select: taskNoteAuthorSelect } },
  });
  emitTaskChange(teamId, taskId, "notes", user.id);
  return c.json({ data: note });
});

// DELETE /api/teams/:teamId/tasks/:taskId/notes/:noteId
tasksRouter.delete("/:taskId/notes/:noteId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId, noteId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    select: { id: true, creatorId: true, kind: true },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can delete notes", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }

  const existing = await prisma.taskNote.findFirst({ where: { id: noteId, taskId } });
  if (!existing) return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
  if (!canModerateTaskNote(membership.role, user.id, task.creatorId, existing.createdById)) {
    return c.json({ error: { message: "You cannot delete this note", code: "FORBIDDEN" } }, 403);
  }

  await prisma.taskNote.delete({ where: { id: noteId } });
  emitTaskChange(teamId, taskId, "notes", user.id);
  return c.body(null, 204);
});

// GET /api/teams/:teamId/tasks/:taskId
tasksRouter.get("/:taskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      subtasks: subtasksInclude,
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canAccessTask(task, user.id)) {
    return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({ data: task });
});

// PATCH /api/teams/:teamId/tasks/:taskId
tasksRouter.patch("/:taskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    include: { recurrenceRule: true },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can update this reminder", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }

  const isCreator = task.creatorId === user.id;

  if (!isCreator) {
    // Assignees may only change status (complete or recall)
    const isAssignee = await prisma.taskAssignment.findFirst({ where: { taskId, userId: user.id } });
    if (!isAssignee) {
      return c.json({ error: { message: "Only the task creator can edit this task", code: "FORBIDDEN" } }, 403);
    }
  }

  const body = await c.req.json();
  const { title, description, priority, dueDate, status: rawStatus, attachmentUrl, scope: scopeRaw, timeZone: bodyTimeZone } = body;
  const status = rawStatus !== undefined ? normalizeTaskStatus(rawStatus) : undefined;
  const recurrenceScope = parseRecurrenceScope(scopeRaw);
  const userTimeZone = await getUserTimeZone(user.id, bodyTimeZone);

  const descriptionChanged =
    description !== undefined &&
    (description?.trim() ?? null) !== (task.description?.trim() ?? null);
  const attachmentChanged =
    attachmentUrl !== undefined && (attachmentUrl ?? null) !== (task.attachmentUrl ?? null);
  if (descriptionChanged) {
    return c.json(
      { error: { message: "Task details can only be set when creating a task", code: "DESCRIPTION_LOCKED" } },
      400,
    );
  }
  if (attachmentChanged) {
    return c.json(
      { error: { message: "Task photos can only be added when creating a task", code: "ATTACHMENT_LOCKED" } },
      400,
    );
  }

  // Non-creators may only update status (complete / recall)
  if (!isCreator && (title !== undefined || description !== undefined || priority !== undefined || dueDate !== undefined || attachmentUrl !== undefined)) {
    return c.json({ error: { message: "Only the task creator can edit task details", code: "FORBIDDEN" } }, 403);
  }
  if (!isCreator && status !== undefined && status !== "done" && status !== "todo") {
    return c.json({ error: { message: "Only the task creator can set this status", code: "FORBIDDEN" } }, 403);
  }

  // Completed tasks are locked — only a status change away from "done" (recall) is allowed
  if (task.status === "done" && status === "done") {
    return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);
  }
  if (task.status === "done" && (title !== undefined || description !== undefined || priority !== undefined || dueDate !== undefined || attachmentUrl !== undefined)) {
    return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);
  }
  // Check-in follow-up tasks stay closed once completed.
  if (task.status === "done" && status !== undefined && status !== "done") {
    if (isFeedbackTaskDescription(task.description)) {
      return c.json(
        { error: { message: "Check-in follow-up tasks cannot be reopened.", code: "FEEDBACK_TASK_LOCKED" } },
        400,
      );
    }
    const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : 0;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (Date.now() - completedAt > twoHoursMs) {
      return c.json({ error: { message: "Tasks cannot be reopened more than 2 hours after completion.", code: "RECALL_WINDOW_EXPIRED" } }, 400);
    }
  }

  // Check-in follow-up tasks can only be completed by submitting the feedback form.
  if (status === "done" && task.status !== "done" && isFeedbackTaskDescription(task.description)) {
    return c.json(
      {
        error: {
          message: "Complete this follow-up by sharing your check-in notes.",
          code: "FEEDBACK_FORM_REQUIRED",
        },
      },
      400,
    );
  }

  if (status === "done") {
    const subtasks = await prisma.subtask.findMany({
      where: { taskId },
      select: { completed: true, _count: { select: { completions: true } } },
    });
    const hasIncomplete = subtasks.some(
      (subtask) =>
        !isSubtaskSharedComplete({
          completed: subtask.completed,
          completionCount: subtask._count.completions,
        }),
    );
    if (hasIncomplete) {
      return c.json({ error: { message: "Complete all subtasks first", code: "SUBTASKS_INCOMPLETE" } }, 400);
    }
  }

  if (isCreator && recurrenceScope === "series") {
    await updateTaskWithSeriesScope(prisma, task, recurrenceScope, {
      ...(title !== undefined ? { title } : {}),
      ...(priority !== undefined ? { priority } : {}),
    });
  }

  const transitionAt = new Date();
  const transactionResult = await withSerializableMomentumTransaction(prisma, async (tx) => {
    const current = await tx.task.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (!current) throw new Error(`Task ${taskId} not found`);

    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? parseCalendarDueDate(dueDate, userTimeZone) : null } : {}),
        ...(status !== undefined
          ? {
              status,
              ...(status === "done"
                ? current.status !== "done"
                  ? { completedAt: transitionAt }
                  : {}
                : { completedAt: null }),
              archivedAt: null,
            }
          : {}),
      },
      include: {
        assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        subtasks: subtasksInclude,
        recurrenceRule: true,
        creator: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    const completed = status === "done" && current.status !== "done";
    const recalled = current.status === "done" && status !== undefined && status !== "done";
    let momentum: MomentumLifecycleResult | null = null;
    if (completed) {
      momentum = await applyMomentumCompletion(tx, {
        taskId,
        actorUserId: user.id,
        completedAt: updated.completedAt ?? transitionAt,
      });
    } else if (recalled) {
      momentum = await revokeMomentumCompletion(tx, {
        taskId,
        revokedAt: transitionAt,
      });
    }
    return { updated, momentum, completed };
  });
  const { updated, momentum, completed } = transactionResult;
  const milestoneCount = momentum?.milestoneCount ?? null;
  const personalBestCount = momentum?.personalBestCount ?? null;

  if (completed && updated.kind === "workspace_task") {
    const completedAt = updated.completedAt ?? transitionAt;
    // Log activity for task completion
    await logActivity({
      teamId,
      userId: user.id,
      type: "task_completed",
      metadata: {
        taskId,
        idempotencyKey: `task_completed:${teamId}:${taskId}:${completedAt.toISOString()}`,
        momentumCreditIds: momentum?.creditIds ?? [],
        taskTitle: updated.incognito ? null : updated.title,
        dueDate: updated.dueDate?.toISOString() ?? null,
        completedAt: completedAt.toISOString(),
        completedOnTime: updated.dueDate ? completedAt <= updated.dueDate : null,
        assignees: updated.assignments.map((a) => ({
          id: a.userId,
          name: a.user.name,
          image: a.user.image ?? null,
        })),
      },
    });

    // Notify the task creator if the completer is someone else
    if (task.creatorId !== user.id) {
      void (async () => {
        const completer = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
        await sendPushToUsers(
          [task.creatorId],
          completer?.name ?? "Someone",
          `✅ Completed: ${task.title}`,
          { taskId, teamId, type: "task_completed" },
          "notifTaskAssigned",
          teamId
        );
      })();
    }
    if (milestoneCount !== null) {
      await logActivity({
        teamId,
        userId: user.id,
        type: "task_milestone",
        metadata: { count: milestoneCount, userName: user.name, incognito: task.incognito, taskId },
      });
    }
    if (personalBestCount !== null) {
      await logActivity({
        teamId,
        userId: user.id,
        type: "personal_best",
        metadata: { count: personalBestCount, userName: user.name, incognito: task.incognito, taskId },
      });
    }
  }

  emitTaskChange(teamId, taskId, "details", user.id);
  return c.json({ data: updated, ...(milestoneCount !== null ? { milestone: milestoneCount } : {}), ...(personalBestCount !== null ? { comeback: personalBestCount } : {}) });
});

// DELETE /api/teams/:teamId/tasks/:taskId
tasksRouter.delete("/:taskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();
  const scope = parseRecurrenceScope(c.req.query("scope"));

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({
    where: { id: taskId, teamId },
    include: { recurrenceRule: true },
  });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can delete this reminder", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }

  const canDelete =
    task.creatorId === user.id ||
    canManageWorkspaceTasks(membership.role);
  if (!canDelete) {
    return c.json(
      {
        error: {
          message: "Only the task creator or a workspace leader can delete this task",
          code: "FORBIDDEN",
        },
      },
      403,
    );
  }

  await deleteTaskWithScope(prisma, task, scope);
  await deleteStorageObjectByUrlIfOwned(task.attachmentUrl);
  emitTaskChange(teamId, taskId, "deleted", user.id);
  return c.body(null, 204);
});

// POST /api/teams/:teamId/tasks/:taskId/assign
tasksRouter.post("/:taskId/assign", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can update assignments", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }
  if (task.kind === "reminder") {
    return c.json({ error: { message: "Reminder assignment is fixed to its creator", code: REMINDER_ASSIGNMENT_LOCKED } }, 400);
  }
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const body = await c.req.json();
  const { userIds } = body;
  const assignmentIds = Array.isArray(userIds)
    ? [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  const activeAssignees = await prisma.teamMember.findMany({
    where: { teamId, userId: { in: assignmentIds } },
    select: { userId: true },
  });
  if (activeAssignees.length !== assignmentIds.length) {
    return c.json(
      { error: { message: "Workspace tasks may only be assigned to active workspace members", code: TASK_ASSIGNEE_INVALID } },
      400,
    );
  }

  // Upsert each assignment
  for (const userId of assignmentIds) {
    await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });
  }

  const updated = await prisma.task.findFirst({
    where: { id: taskId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      subtasks: subtasksInclude,
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Notify assigned users (except the person doing the assigning)
  const assignedUserIds = assignmentIds.filter((id) => id !== user.id);
  if (assignedUserIds.length > 0) {
    const taskForNotif = await prisma.task.findFirst({ where: { id: taskId }, select: { title: true } });
    await sendPushToUsers(assignedUserIds, "New task assigned", taskForNotif?.title ?? "You have a new task", { taskId, teamId }, "notifTaskAssigned", teamId);
  }

  // Log activity for each newly assigned user
  const assignedUsersForAssignLog = await prisma.user.findMany({
    where: { id: { in: assignmentIds } },
    select: { id: true, name: true },
  });
  const assignUserNameMap = Object.fromEntries(assignedUsersForAssignLog.map((u) => [u.id, u.name ?? ""]));
  for (const assignedUserId of assignmentIds) {
    await logActivity({
      teamId,
      userId: assignedUserId,
      type: "task_assigned",
      metadata: { taskTitles: [task.title], taskCount: 1, assigneeName: assignUserNameMap[assignedUserId] ?? "" },
    });
  }

  emitTaskChange(teamId, taskId, "assignment", user.id);
  return c.json({ data: updated });
});

// DELETE /api/teams/:teamId/tasks/:taskId/assign/:userId
tasksRouter.delete("/:taskId/assign/:userId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId, userId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can update assignments", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }
  if (task.kind === "reminder") {
    return c.json({ error: { message: "Reminder assignment is fixed to its creator", code: REMINDER_ASSIGNMENT_LOCKED } }, 400);
  }
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const isCreator = task.creatorId === user.id;
  const isManager = canManageWorkspaceTasks(membership.role);
  const isSelfUnassign = userId === user.id;
  if (!isCreator && !isManager && !isSelfUnassign) {
    return c.json({ error: { message: "Only the task creator or an admin can unassign other members", code: "FORBIDDEN" } }, 403);
  }

  await prisma.taskAssignment.deleteMany({ where: { taskId, userId } });
  emitTaskChange(teamId, taskId, "assignment", user.id);
  return c.body(null, 204);
});

// POST /api/teams/:teamId/tasks/:taskId/subtasks
tasksRouter.post("/:taskId/subtasks", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can update subtasks", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const body = await c.req.json();
  if (!body.title?.trim()) return c.json({ error: { message: "Title required", code: "VALIDATION_ERROR" } }, 400);

  const count = await prisma.subtask.count({ where: { taskId } });
  const subtask = await prisma.subtask.create({
    data: { title: body.title.trim(), taskId, order: count },
  });
  emitTaskChange(teamId, taskId, "subtask", user.id);
  return c.json({ data: subtask }, 201);
});

// PATCH /api/teams/:teamId/tasks/:taskId/subtasks/:subtaskId
tasksRouter.patch("/:taskId/subtasks/:subtaskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId, subtaskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can update subtasks", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);
  const existingSubtask = await prisma.subtask.findFirst({ where: { id: subtaskId, taskId }, select: { id: true } });
  if (!existingSubtask) {
    return c.json({ error: { message: "Subtask not found", code: "NOT_FOUND" } }, 404);
  }

  const body = await c.req.json();
  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const completed =
    typeof body.completed === "boolean" ? body.completed : undefined;

  const subtask = await prisma.$transaction(async (tx) => {
    if (completed === true && task.isJoint) {
      const existing = await tx.subtaskCompletion.findFirst({
        where: { subtaskId },
        orderBy: { completedAt: "asc" },
      });
      if (!existing || existing.userId === user.id) {
        await tx.subtaskCompletion.upsert({
          where: { subtaskId_userId: { subtaskId, userId: user.id } },
          create: { subtaskId, userId: user.id },
          update: {},
        });
        await tx.subtaskCompletion.deleteMany({
          where: { subtaskId, userId: { not: user.id } },
        });
      }
    }
    if (completed === false) {
      await tx.subtaskCompletion.deleteMany({ where: { subtaskId } });
    }
    return tx.subtask.update({
      where: { id: subtaskId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(completed !== undefined ? { completed } : {}),
      },
      include: subtasksInclude.include,
    });
  });
  emitTaskChange(teamId, taskId, "subtask", user.id);
  return c.json({ data: subtask });
});

// DELETE /api/teams/:teamId/tasks/:taskId/subtasks/:subtaskId
tasksRouter.delete("/:taskId/subtasks/:subtaskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { subtaskId, taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);
  if (!canMutateTask(task, user.id)) {
    return c.json({ error: { message: "Only the reminder creator can delete subtasks", code: REMINDER_CREATOR_REQUIRED } }, 403);
  }
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);
  const existingSubtask = await prisma.subtask.findFirst({ where: { id: subtaskId, taskId }, select: { id: true } });
  if (!existingSubtask) {
    return c.json({ error: { message: "Subtask not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.subtask.delete({ where: { id: subtaskId } });
  emitTaskChange(teamId, taskId, "subtask", user.id);
  return c.body(null, 204);
});

export { tasksRouter };
