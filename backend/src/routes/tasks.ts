import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { getTeamSubscription } from "./subscription";
import { logActivity } from "../lib/activity";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const tasksRouter = new Hono<{ Variables: Variables }>();
tasksRouter.use("*", authGuard);

// Helper: compute next due date for recurrence
function getNextDueDate(
  type: string,
  interval: number,
  fromDate: Date,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null
): Date {
  const next = new Date(fromDate);
  switch (type) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      if (daysOfWeek != null && daysOfWeek !== "") {
        const targetDay = parseInt(daysOfWeek);
        const diff = (targetDay - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + diff);
      }
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      if (dayOfMonth != null) {
        const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, daysInMonth));
      }
      break;
    default:
      next.setDate(next.getDate() + interval);
  }
  return next;
}

// Check membership helper
async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

// GET /api/teams/:teamId/tasks
tasksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const subscription = await getTeamSubscription(teamId);
  if (subscription.plan !== "pro") {
    return c.json({ error: { message: "Task manager requires Alenio Pro", code: "SUBSCRIPTION_REQUIRED" } }, 403);
  }

  const { status, priority, assigneeId, creatorId, myTasks } = c.req.query();

  const resolvedAssigneeId = assigneeId === "me" ? user.id : assigneeId;

  const tasks = await prisma.task.findMany({
    where: {
      teamId,
      ...(status ? { status } : {}),
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
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      subtasks: { orderBy: { order: 'asc' } },
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return c.json({ data: tasks });
});

// POST /api/teams/:teamId/tasks
tasksRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const subscription = await getTeamSubscription(teamId);
  if (subscription.plan !== "pro") {
    return c.json({ error: { message: "Task manager requires Alenio Pro", code: "SUBSCRIPTION_REQUIRED" } }, 403);
  }

  const body = await c.req.json();
  const { title, description, priority, dueDate, assigneeIds, recurrence, attachmentUrl, incognito } = body;

  if (!title?.trim()) {
    return c.json({ error: { message: "Title is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim(),
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      incognito: incognito === true,
      teamId,
      creatorId: user.id,
      ...(attachmentUrl ? { attachmentUrl } : {}),
      ...(assigneeIds?.length
        ? { assignments: { create: (assigneeIds as string[]).map((id) => ({ userId: id })) } }
        : {}),
      ...(recurrence
        ? {
            recurrenceRule: {
              create: {
                type: recurrence.type,
                interval: recurrence.interval || 1,
                daysOfWeek: recurrence.daysOfWeek,
                dayOfMonth: recurrence.dayOfMonth,
                nextDueAt: dueDate
                  ? getNextDueDate(recurrence.type, recurrence.interval || 1, new Date(dueDate), recurrence.daysOfWeek, recurrence.dayOfMonth)
                  : null,
              },
            },
          }
        : {}),
    },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      subtasks: { orderBy: { order: 'asc' } },
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  return c.json({ data: task }, 201);
});

// GET /api/teams/:teamId/tasks/member-stats - task stats per team member
// MUST be before /:taskId routes so Hono doesn't match "member-stats" as a taskId
tasksRouter.get("/member-stats", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const now = new Date();

  // Fetch all assigned tasks for this team in one query
  const assignments = await prisma.taskAssignment.findMany({
    where: { task: { teamId } },
    include: {
      task: { select: { status: true, dueDate: true, completedAt: true } },
    },
  });

  // Group stats by userId
  const statsMap: Record<string, { activeTasks: number; overdueTasks: number; onTimeCompletions: number }> = {};

  for (const a of assignments) {
    if (!statsMap[a.userId]) {
      statsMap[a.userId] = { activeTasks: 0, overdueTasks: 0, onTimeCompletions: 0 };
    }
    const s = statsMap[a.userId]!;
    const { status, dueDate, completedAt } = a.task;

    if (status !== "done") {
      s.activeTasks++;
      if (dueDate && dueDate < now) s.overdueTasks++;
    } else {
      // On time: completed before or on the due date
      if (dueDate && completedAt && completedAt <= dueDate) s.onTimeCompletions++;
    }
  }

  return c.json({ data: statsMap });
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
      subtasks: { orderBy: { order: 'asc' } },
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

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
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
  const { title, description, priority, dueDate, status, attachmentUrl } = body;

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

  if (status === "done") {
    const incompleteSubtasks = await prisma.subtask.count({
      where: { taskId, completed: false },
    });
    if (incompleteSubtasks > 0) {
      return c.json({ error: { message: `Complete all subtasks first (${incompleteSubtasks} remaining)`, code: "SUBTASKS_INCOMPLETE" } }, 400);
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(status !== undefined ? { status, completedAt: status === "done" ? new Date() : null } : {}),
      ...(attachmentUrl !== undefined ? { attachmentUrl } : {}),
    },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      subtasks: { orderBy: { order: 'asc' } },
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  // Handle recurrence: if completed, spawn next occurrence
  let milestoneCount: number | null = null;
  if (status === "done" && task.status !== "done") {
    // Log activity for task completion
    await logActivity({
      teamId,
      userId: user.id,
      type: "task_completed",
      metadata: { taskTitle: task.incognito ? null : task.title },
    });

    // Check for on-time completion milestone (every 10 tasks)
    const onTimeResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM Task t
      JOIN TaskAssignment ta ON ta.taskId = t.id
      WHERE t.teamId = ${teamId}
      AND ta.userId = ${user.id}
      AND t.status = 'done'
      AND t.completedAt IS NOT NULL
      AND t.dueDate IS NOT NULL
      AND t.completedAt <= t.dueDate
    `;
    const onTimeCount = Number(onTimeResult[0]?.count ?? 0);
    const isMilestone = onTimeCount === 5 || onTimeCount === 10 || onTimeCount === 15 || (onTimeCount >= 20 && onTimeCount % 10 === 0);
    if (isMilestone) {
      milestoneCount = onTimeCount;
      await logActivity({
        teamId,
        userId: user.id,
        type: "task_milestone",
        metadata: { count: onTimeCount, userName: user.name, incognito: task.incognito },
      });
    }

    const rule = await prisma.recurrenceRule.findUnique({ where: { taskId } });
    if (rule) {
      const baseDue = task.dueDate || new Date();
      const nextDue = getNextDueDate(rule.type, rule.interval, baseDue, rule.daysOfWeek, rule.dayOfMonth);
      const currentAssignees = await prisma.taskAssignment.findMany({ where: { taskId } });

      await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "todo",
          dueDate: nextDue,
          teamId: task.teamId,
          creatorId: task.creatorId,
          assignments: {
            create: currentAssignees.map((a) => ({ userId: a.userId })),
          },
          recurrenceRule: {
            create: {
              type: rule.type,
              interval: rule.interval,
              daysOfWeek: rule.daysOfWeek,
              dayOfMonth: rule.dayOfMonth,
              nextDueAt: getNextDueDate(rule.type, rule.interval, nextDue, rule.daysOfWeek, rule.dayOfMonth),
            },
          },
        },
      });
    }
  }

  return c.json({ data: updated, ...(milestoneCount !== null ? { milestone: milestoneCount } : {}) });
});

// DELETE /api/teams/:teamId/tasks/:taskId
tasksRouter.delete("/:taskId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { taskId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const task = await prisma.task.findFirst({ where: { id: taskId, teamId } });
  if (!task) return c.json({ error: { message: "Task not found", code: "NOT_FOUND" } }, 404);

  if (task.creatorId !== user.id) {
    return c.json({ error: { message: "Only the task creator can delete this task", code: "FORBIDDEN" } }, 403);
  }

  await prisma.task.delete({ where: { id: taskId } });
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
      subtasks: { orderBy: { order: 'asc' } },
      recurrenceRule: true,
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify assigned users (except the person doing the assigning)
  const assignedUserIds = (userIds as string[]).filter((id) => id !== user.id);
  if (assignedUserIds.length > 0) {
    const taskForNotif = await prisma.task.findFirst({ where: { id: taskId }, select: { title: true } });
    await sendPushToUsers(assignedUserIds, "New task assigned", taskForNotif?.title ?? "You have a new task", { taskId, teamId }, "notifTaskAssigned");
  }

  // Log activity for each newly assigned user
  for (const assignedUserId of userIds as string[]) {
    const assignedUser = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { name: true } });
    await logActivity({
      teamId,
      userId: assignedUserId,
      type: "task_assigned",
      metadata: { taskTitle: task.title, assigneeName: assignedUser?.name ?? "" },
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
  const isAdmin = membership.role === "owner" || membership.role === "admin";
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
  const subtask = await prisma.subtask.update({
    where: { id: subtaskId },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.completed !== undefined ? { completed: body.completed } : {}),
    },
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
