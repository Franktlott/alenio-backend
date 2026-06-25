import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { getTeamSubscription } from "./subscription";
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
import {
  buildDevelopmentGoalActivityAlerts,
  reconcileInactiveDevelopmentGoals,
} from "../lib/development-goal-activity";
import { oneOnOnePublishedAt } from "../lib/one-on-one-meeting-dates";

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
  },
  recurrence: RecurrenceBody | undefined,
  dueDate: string | null | undefined,
  timeZone: string,
) {
  if (!recurrence) return {};

  const occurrenceCount = resolveRecurrenceOccurrenceCount(recurrence);
  const series = await createRecurrenceSeries(prisma, taskSeed, { ...recurrence, timeZone });
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

type CompletionMeta = {
  completedOnTime?: boolean;
  dueDate?: string | null;
  completedAt?: string | null;
  assignees?: Array<{ id?: string }>;
};

function getCompletionMetaForUser(
  activity: { userId: string | null; metadata: string | null },
  userId: string
): { completedOnTime: boolean } | null {
  let meta: CompletionMeta = {};
  if (activity.metadata) {
    try {
      meta = JSON.parse(activity.metadata) as CompletionMeta;
    } catch {
      meta = {};
    }
  }

  const assigneeIds = (meta.assignees ?? []).map((a) => a.id).filter((id): id is string => typeof id === "string");
  const isRelevant = activity.userId === userId || assigneeIds.includes(userId);
  if (!isRelevant) return null;

  let completedOnTime = true;
  if (typeof meta.completedOnTime === "boolean") {
    completedOnTime = meta.completedOnTime;
  } else if (meta.completedAt && meta.dueDate) {
    completedOnTime = new Date(meta.completedAt) <= new Date(meta.dueDate);
  }

  return { completedOnTime };
}

async function getUserCompletionOutcomes(teamId: string, userId: string): Promise<boolean[]> {
  const completionActivities = await prisma.teamActivity.findMany({
    where: { teamId, type: "task_completed" },
    select: { userId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const outcomes: boolean[] = [];
  for (const activity of completionActivities) {
    const parsed = getCompletionMetaForUser(activity, userId);
    if (!parsed) continue;
    outcomes.push(parsed.completedOnTime);
  }
  return outcomes;
}

// Recalculate and store streak without awarding milestones (used on recall)
async function recalculateStreak(userId: string, teamId: string) {
  const outcomes = await getUserCompletionOutcomes(teamId, userId);
  let streak = 0;
  for (const completedOnTime of outcomes) {
    if (completedOnTime) streak++;
    else break;
  }
  await prisma.teamMember.updateMany({
    where: { userId, teamId },
    data: { currentStreak: streak },
  });
}

// Streak helper: calculate streak and award milestone/personal-best for a single user
async function calculateAndAwardStreak(
  userId: string,
  teamId: string,
  taskTitle: string,
  taskIncognito: boolean,
  userName: string | null
): Promise<{ milestoneCount: number | null; personalBestCount: number | null }> {
  let milestoneCount: number | null = null;
  let personalBestCount: number | null = null;

  // Consecutive on-time completions since last overdue (most recent first)
  const outcomes = await getUserCompletionOutcomes(teamId, userId);
  let streak = 0;
  for (const completedOnTime of outcomes) {
    if (completedOnTime) {
      streak++;
    } else {
      break;
    }
  }

  // Persist streak so it survives task deletion (updateMany: no throw if row missing)
  await prisma.teamMember.updateMany({
    where: { userId, teamId },
    data: { currentStreak: streak },
  });

  const isMilestone = streak === 5 || streak === 10 || streak === 15 || (streak >= 20 && streak % 10 === 0);
  if (isMilestone) {
    milestoneCount = streak;
    await logActivity({
      teamId,
      userId,
      type: "task_milestone",
      metadata: { count: streak, userName, incognito: taskIncognito },
    });
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalBestStreak: true, personalBestCelebrated: true },
  });

  if (streak === 0) {
    // Task was completed late — reset the flag so the next comeback can be celebrated
    if (fullUser?.personalBestCelebrated) {
      await prisma.user.update({ where: { id: userId }, data: { personalBestCelebrated: false } });
    }
  } else if (fullUser && streak >= fullUser.personalBestStreak && fullUser.personalBestStreak > 0) {
    if (!fullUser.personalBestCelebrated) {
      // First time crossing the personal best in this comeback — check for late task history
      const lateCount = outcomes.filter((completedOnTime) => !completedOnTime).length;
      if (lateCount > 0) {
        // Celebrate once and mark as celebrated — won't fire again until next streak break
        await prisma.user.update({ where: { id: userId }, data: { personalBestStreak: streak, personalBestCelebrated: true } });
        personalBestCount = streak;
        await logActivity({
          teamId,
          userId,
          type: "personal_best",
          metadata: { count: streak, userName, incognito: taskIncognito },
        });
      } else {
        // No late history yet — update PB silently
        await prisma.user.update({ where: { id: userId }, data: { personalBestStreak: streak } });
      }
    } else {
      // Already celebrated this comeback — just update PB silently
      await prisma.user.update({ where: { id: userId }, data: { personalBestStreak: streak } });
    }
  }

  return { milestoneCount, personalBestCount };
}

// GET /api/teams/:teamId/tasks
tasksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const subscription = await getTeamSubscription(teamId);
  if (!["team", "pro"].includes(subscription.plan)) {
    return c.json({ error: { message: "Task manager requires Alenio Team or Pro", code: "SUBSCRIPTION_REQUIRED" } }, 403);
  }

  const { status, priority, assigneeId, creatorId, myTasks, cursor, dueYear, dueMonth, completedYear, completedMonth } =
    c.req.query();
  const rawLimit = Number(c.req.query("limit") ?? 50);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 200);

  const resolvedAssigneeId = assigneeId === "me" ? user.id : assigneeId;

  const monthBounds = (year: number, month: number) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { monthStart, monthEnd };
  };

  const monthFilters: Record<string, unknown>[] = [];
  if (dueYear && dueMonth !== undefined) {
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
  if (completedYear && completedMonth !== undefined) {
    const y = parseInt(completedYear, 10);
    const m = parseInt(completedMonth, 10);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      const { monthStart, monthEnd } = monthBounds(y, m);
      monthFilters.push({ completedAt: { gte: monthStart, lte: monthEnd } });
    }
  }

  const activeOnly = c.req.query("activeOnly") === "true";

  if (!cursor || activeOnly) {
    await materializeRecurringTasksForTeam(prisma, teamId);
  }

  const tasks = await prisma.task.findMany({
    where: {
      teamId,
      ...(status ? { status } : activeOnly ? { status: { not: "done" } } : {}),
      ...(priority ? { priority } : {}),
      ...(myTasks === "true" ? {
        OR: [
          { assignments: { some: { userId: user.id } } },
          { creatorId: user.id, assignments: { none: {} } },
        ],
      } : {}),
      ...(resolvedAssigneeId ? { assignments: { some: { userId: resolvedAssigneeId } } } : {}),
      // "me" is a shorthand that resolves to the authenticated user's ID
      ...(creatorId ? { creatorId: creatorId === "me" ? user.id : creatorId } : {}),
      ...(monthFilters.length && !activeOnly ? { AND: monthFilters } : {}),
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      subtasks: subtasksInclude,
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
      oneOnOneMeeting: {
        select: {
          id: true,
          memberUserId: true,
          createdById: true,
          templateTitle: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
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

  const subscription = await getTeamSubscription(teamId);
  if (!["team", "pro"].includes(subscription.plan)) {
    return c.json({ error: { message: "Task manager requires Alenio Team or Pro", code: "SUBSCRIPTION_REQUIRED" } }, 403);
  }

  const body = await c.req.json();
  const { title, description, priority, dueDate, status, assigneeIds, recurrence, attachmentUrl, incognito, isJoint, subtasks, timeZone: bodyTimeZone } = body;

  if (!title?.trim()) {
    return c.json({ error: { message: "Title is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const userTimeZone = await getUserTimeZone(user.id, bodyTimeZone);

  const taskInclude = {
    assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
    subtasks: subtasksInclude,
    recurrenceRule: true,
    creator: { select: { id: true, name: true, email: true } },
  } as const;

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
    incognito: incognito === true,
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
    incognito: incognito === true,
    isJoint: isJoint === true,
    attachmentUrl: attachmentUrl ?? null,
  };

  // Reminders are always self-assigned to the creator
  const ids: string[] = assigneeIds?.length ? (assigneeIds as string[]) : [];

  let tasks: Awaited<ReturnType<typeof prisma.task.create>>[];

  if (isJoint === true && ids.length > 1) {
    // Joint task: one task shared by all assignees
    const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
    const task = await prisma.task.create({
      data: {
        ...baseTaskData,
        ...recurrenceFields,
        isJoint: true,
        assignments: { create: ids.map((uid: string) => ({ userId: uid })) },
        ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
      },
      include: taskInclude,
    });
    tasks = [task];
  } else if (ids.length <= 1) {
    // Single task (0 or 1 assignee)
    const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
    const task = await prisma.task.create({
      data: {
        ...baseTaskData,
        ...recurrenceFields,
        ...(ids.length === 1 ? { assignments: { create: [{ userId: ids[0]! }] } } : {}),
        ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
      },
      include: taskInclude,
    });
    tasks = [task];
  } else {
    // One task per assignee (existing behavior)
    tasks = await Promise.all(
      ids.map(async (assigneeId) => {
        const recurrenceFields = await buildRecurrenceTaskFields(taskSeed, recurrence, dueDate, userTimeZone);
        return prisma.task.create({
          data: {
            ...baseTaskData,
            ...recurrenceFields,
            assignments: { create: [{ userId: assigneeId }] },
            ...(subtaskList.length > 0 ? { subtasks: { create: subtaskList } } : {}),
          },
          include: taskInclude,
        });
      }),
    );
  }

  // Send push notifications to assignees (excluding the creator)
  const assigneesToNotify = ids.filter((id) => id !== user.id);
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
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const userNameMapForLog = Object.fromEntries(assignedUsersForLog.map((u) => [u.id, u.name ?? ""]));
  for (const assigneeId of ids) {
    await logActivity({
      teamId,
      userId: assigneeId,
      type: "task_assigned",
      metadata: { taskTitles: incognito ? [] : [title.trim()], taskCount: 1, assigneeName: userNameMapForLog[assigneeId] ?? "" },
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

  return c.json({ data: tasks }, 201);
});

// GET /api/teams/:teamId/tasks/member-stats - task stats per team member
// MUST be before /:taskId routes so Hono doesn't match "member-stats" as a taskId
tasksRouter.get("/member-stats", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const now = new Date();

  // Accept optional year/month query params (month is 0-indexed)
  const yearParam = c.req.query("year");
  const monthParam = c.req.query("month");
  const targetYear = yearParam ? parseInt(yearParam) : now.getFullYear();
  const targetMonth = monthParam !== undefined ? parseInt(monthParam) : now.getMonth();

  // Fetch all assigned tasks for this team in one query
  const assignments = await prisma.taskAssignment.findMany({
    where: { task: { teamId } },
    include: {
      task: {
        select: {
          status: true,
          dueDate: true,
          completedAt: true,
          oneOnOneMeetingId: true,
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
      user: { select: { name: true, email: true } },
    },
  });
  const storedStreaks: Record<string, number> = {};
  for (const m of teamMembers) storedStreaks[m.userId] = m.currentStreak;

  // Group by userId
  const userTasks: Record<
    string,
    { status: string; dueDate: Date | null; completedAt: Date | null; oneOnOneMeetingId: string | null }[]
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
      completedTasks: number;
      streak: number;
      personalBestStreak: number;
      activeDevGoals: number;
      devEngagementPct: number;
      daysSinceLastOneOnOne: number | null;
      openFollowUpTasks: number;
      overdueFollowUpTasks: number;
    }
  > = {};

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  for (const [userId, tasks] of Object.entries(userTasks)) {
    let activeTasks = 0;
    let overdueTasks = 0;
    let completedTasks = 0;
    let openFollowUpTasks = 0;
    let overdueFollowUpTasks = 0;

    for (const t of tasks) {
      if (t.status !== "done") {
        activeTasks++;
        const isOverdue = !!(t.dueDate && t.dueDate < now);
        if (isOverdue) overdueTasks++;
        if (t.oneOnOneMeetingId) {
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
      completedTasks,
      streak,
      personalBestStreak: 0,
      activeDevGoals: 0,
      devEngagementPct: 0,
      daysSinceLastOneOnOne: null,
      openFollowUpTasks,
      overdueFollowUpTasks,
    };
  }

  const emptyStats = (streak: number) => ({
    activeTasks: 0,
    overdueTasks: 0,
    completedTasks: 0,
    streak,
    personalBestStreak: 0,
    activeDevGoals: 0,
    devEngagementPct: 0,
    daysSinceLastOneOnOne: null as number | null,
    openFollowUpTasks: 0,
    overdueFollowUpTasks: 0,
  });

  // Also include members with no tasks but a stored streak
  for (const m of teamMembers) {
    if (!statsMap[m.userId]) {
      statsMap[m.userId] = emptyStats(m.currentStreak);
    }
  }

  const [devGoals, oneOnOnes] = await Promise.all([
    prisma.developmentGoal.findMany({
      where: { teamId, status: { not: "closed" } },
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
      select: { memberUserId: true, createdAt: true, publishedAt: true },
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
  for (const meeting of oneOnOnes) {
    if (!lastOneOnOneByMember[meeting.memberUserId]) {
      const publishedAt = oneOnOnePublishedAt(meeting);
      if (publishedAt) lastOneOnOneByMember[meeting.memberUserId] = publishedAt;
    }
  }

  const daysSinceCalendar = (then: Date): number => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    return Math.max(0, Math.floor((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000));
  };

  for (const m of teamMembers) {
    const row = statsMap[m.userId] ?? emptyStats(m.currentStreak);
    const dev = devByMember[m.userId] ?? { active: 0, engaged: 0 };
    const lastMeeting = lastOneOnOneByMember[m.userId];
    row.activeDevGoals = dev.active;
    row.devEngagementPct =
      dev.active === 0 ? 0 : Math.round((dev.engaged / dev.active) * 100);
    row.daysSinceLastOneOnOne = lastMeeting ? daysSinceCalendar(lastMeeting) : null;
    statsMap[m.userId] = row;
  }

  // Fetch personalBestStreak for all users in the map
  const userIds = Object.keys(statsMap);
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, personalBestStreak: true },
    });
    for (const u of users) {
      if (statsMap[u.id]) {
        statsMap[u.id]!.personalBestStreak = u.personalBestStreak;
      }
    }
  }

  return c.json({ data: statsMap, developmentGoalAlerts });
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
        status: { in: ["todo", "in-progress"] },
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
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);

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

  if (status === "done") {
    if (task.isJoint) {
      // For joint tasks, check if the current user has completed all subtasks via SubtaskCompletion
      const subtasks = await prisma.subtask.findMany({ where: { taskId }, select: { id: true } });
      const completedByMe = await prisma.subtaskCompletion.count({
        where: { subtaskId: { in: subtasks.map((s) => s.id) }, userId: user.id },
      });
      const remaining = subtasks.length - completedByMe;
      if (remaining > 0) {
        return c.json({ error: { message: `Complete all subtasks first (${remaining} remaining)`, code: "SUBTASKS_INCOMPLETE" } }, 400);
      }
    } else {
      const incompleteSubtasks = await prisma.subtask.count({
        where: { taskId, completed: false },
      });
      if (incompleteSubtasks > 0) {
        return c.json({ error: { message: `Complete all subtasks first (${incompleteSubtasks} remaining)`, code: "SUBTASKS_INCOMPLETE" } }, 400);
      }
    }
  }

  if (isCreator && recurrenceScope === "series") {
    await updateTaskWithSeriesScope(prisma, task, recurrenceScope, {
      ...(title !== undefined ? { title } : {}),
      ...(priority !== undefined ? { priority } : {}),
    });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? parseCalendarDueDate(dueDate, userTimeZone) : null } : {}),
      ...(status !== undefined ? { status, completedAt: status === "done" ? new Date() : null } : {}),
    },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      subtasks: subtasksInclude,
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  // Handle recurrence: if completed, spawn next occurrence
  let milestoneCount: number | null = null;
  let personalBestCount: number | null = null;
  if (status === "done" && task.status !== "done") {
    // Log activity for task completion
    await logActivity({
      teamId,
      userId: user.id,
      type: "task_completed",
      metadata: {
        taskTitle: task.incognito ? null : task.title,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : new Date().toISOString(),
        completedOnTime: task.dueDate ? new Date(updated.completedAt ?? new Date()) <= new Date(task.dueDate) : true,
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

    // Award streak credit to the completing user
    ({ milestoneCount, personalBestCount } = await calculateAndAwardStreak(
      user.id,
      teamId,
      task.title,
      task.incognito,
      user.name
    ));

    // For joint tasks, also award streak credit to every other assignee — await so errors surface
    if (task.isJoint) {
      const allAssignments = await prisma.taskAssignment.findMany({ where: { taskId } });
      const otherAssigneeIds = allAssignments.map((a) => a.userId).filter((id) => id !== user.id);
      if (otherAssigneeIds.length > 0) {
        const otherUsers = await prisma.user.findMany({
          where: { id: { in: otherAssigneeIds } },
          select: { id: true, name: true },
        });
        await Promise.all(
          otherUsers.map((ou) =>
            calculateAndAwardStreak(ou.id, teamId, task.title, task.incognito, ou.name)
          )
        );
      }
    }
  }

  // On recall (done → todo/in_progress): recalculate streaks for all assignees so stored value is accurate
  if (task.status === "done" && status !== undefined && status !== "done") {
    const allAssignments = await prisma.taskAssignment.findMany({ where: { taskId } });
    await Promise.all(
      allAssignments.map((a) => recalculateStreak(a.userId, teamId))
    );
  }

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

  if (task.creatorId !== user.id) {
    return c.json({ error: { message: "Only the task creator can delete this task", code: "FORBIDDEN" } }, 403);
  }

  await deleteTaskWithScope(prisma, task, scope);
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
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const body = await c.req.json();
  const { userIds } = body;

  // Upsert each assignment
  for (const userId of userIds as string[]) {
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
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify assigned users (except the person doing the assigning)
  const assignedUserIds = (userIds as string[]).filter((id) => id !== user.id);
  if (assignedUserIds.length > 0) {
    const taskForNotif = await prisma.task.findFirst({ where: { id: taskId }, select: { title: true } });
    await sendPushToUsers(assignedUserIds, "New task assigned", taskForNotif?.title ?? "You have a new task", { taskId, teamId }, "notifTaskAssigned", teamId);
  }

  // Log activity for each newly assigned user
  const assignedUsersForAssignLog = await prisma.user.findMany({
    where: { id: { in: userIds as string[] } },
    select: { id: true, name: true },
  });
  const assignUserNameMap = Object.fromEntries(assignedUsersForAssignLog.map((u) => [u.id, u.name ?? ""]));
  for (const assignedUserId of userIds as string[]) {
    await logActivity({
      teamId,
      userId: assignedUserId,
      type: "task_assigned",
      metadata: { taskTitles: [task.title], taskCount: 1, assigneeName: assignUserNameMap[assignedUserId] ?? "" },
    });
  }

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
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const isCreator = task.creatorId === user.id;
  const isAdmin = membership.role === "owner" || membership.role === "admin" || membership.role === "team_leader";
  const isSelfUnassign = userId === user.id;
  if (!isCreator && !isAdmin && !isSelfUnassign) {
    return c.json({ error: { message: "Only the task creator or an admin can unassign other members", code: "FORBIDDEN" } }, 403);
  }

  await prisma.taskAssignment.deleteMany({ where: { taskId, userId } });
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
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const body = await c.req.json();
  if (!body.title?.trim()) return c.json({ error: { message: "Title required", code: "VALIDATION_ERROR" } }, 400);

  const count = await prisma.subtask.count({ where: { taskId } });
  const subtask = await prisma.subtask.create({
    data: { title: body.title.trim(), taskId, order: count },
  });
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
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  const body = await c.req.json();

  // For joint tasks toggling completion: track per-user via SubtaskCompletion
  if (task.isJoint && body.completed !== undefined) {
    if (body.completed) {
      await prisma.subtaskCompletion.upsert({
        where: { subtaskId_userId: { subtaskId, userId: user.id } },
        create: { subtaskId, userId: user.id },
        update: {},
      });
    } else {
      await prisma.subtaskCompletion.deleteMany({ where: { subtaskId, userId: user.id } });
    }
    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: subtasksInclude.include,
    });
    return c.json({ data: subtask });
  }

  const subtask = await prisma.subtask.update({
    where: { id: subtaskId },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.completed !== undefined ? { completed: body.completed } : {}),
    },
    include: subtasksInclude.include,
  });
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
  if (task.status === "done") return c.json({ error: { message: "Task is completed. Recall it before making edits.", code: "TASK_COMPLETED" } }, 400);

  await prisma.subtask.delete({ where: { id: subtaskId } });
  return c.body(null, 204);
});

export { tasksRouter };
