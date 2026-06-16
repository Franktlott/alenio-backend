import type { Prisma, PrismaClient, RecurrenceRule, RecurrenceSeries, Task } from "@prisma/client";

export type RecurrenceScope = "task" | "series";

export type RecurrenceInput = {
  type: string;
  interval?: number;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
};

type TaskWithRule = Task & { recurrenceRule?: RecurrenceRule | null };

export function getNextDueDate(
  type: string,
  interval: number,
  fromDate: Date,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null,
): Date {
  const next = new Date(fromDate);
  switch (type) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      if (daysOfWeek != null && daysOfWeek !== "") {
        const targetDay = parseInt(daysOfWeek, 10);
        const diff = (targetDay - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + diff);
      }
      break;
    case "monthly": {
      const rawMonth = next.getMonth() + interval;
      const targetYear = next.getFullYear() + Math.floor(rawMonth / 12);
      const targetMonth = ((rawMonth % 12) + 12) % 12;
      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const targetDay =
        dayOfMonth != null
          ? Math.min(dayOfMonth, daysInTargetMonth)
          : Math.min(next.getDate(), daysInTargetMonth);
      next.setFullYear(targetYear, targetMonth, targetDay);
      break;
    }
    default:
      next.setDate(next.getDate() + interval);
  }
  return next;
}

export function isRecurringTask(task: Pick<Task, "recurrenceSeriesId"> & { recurrenceRule?: RecurrenceRule | null }) {
  return !!(task.recurrenceSeriesId || task.recurrenceRule);
}

export async function createRecurrenceSeries(
  prisma: PrismaClient,
  task: Pick<Task, "teamId" | "creatorId" | "title" | "description" | "priority" | "incognito" | "isJoint" | "attachmentUrl">,
  recurrence: RecurrenceInput,
): Promise<RecurrenceSeries> {
  return prisma.recurrenceSeries.create({
    data: {
      teamId: task.teamId,
      creatorId: task.creatorId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      incognito: task.incognito,
      isJoint: task.isJoint,
      attachmentUrl: task.attachmentUrl,
      type: recurrence.type,
      interval: recurrence.interval ?? 1,
      daysOfWeek: recurrence.daysOfWeek ?? null,
      dayOfMonth: recurrence.dayOfMonth ?? null,
    },
  });
}

export async function resolveRecurrenceSeries(
  prisma: PrismaClient,
  task: TaskWithRule,
): Promise<RecurrenceSeries | null> {
  if (task.recurrenceSeriesId) {
    return prisma.recurrenceSeries.findUnique({ where: { id: task.recurrenceSeriesId } });
  }
  if (!task.recurrenceRule) return null;

  const series = await createRecurrenceSeries(prisma, task, {
    type: task.recurrenceRule.type,
    interval: task.recurrenceRule.interval,
    daysOfWeek: task.recurrenceRule.daysOfWeek,
    dayOfMonth: task.recurrenceRule.dayOfMonth,
  });
  await prisma.task.update({
    where: { id: task.id },
    data: { recurrenceSeriesId: series.id },
  });
  return series;
}

export const RECURRENCE_LOOKAHEAD_DAYS = 365;
const RECURRENCE_SPAWN_CHUNK = 25;

function dueDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function listFutureRecurrenceDueDates(
  type: string,
  interval: number,
  anchorDue: Date,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null,
): Date[] {
  const through = new Date(anchorDue);
  through.setDate(through.getDate() + RECURRENCE_LOOKAHEAD_DAYS);

  const maxCount = type === "daily" ? 366 : type === "weekly" ? 53 : 13;
  const dates: Date[] = [];
  let current = anchorDue;

  while (dates.length < maxCount) {
    const next = getNextDueDate(type, interval, current, daysOfWeek, dayOfMonth);
    if (next.getTime() > through.getTime()) break;
    dates.push(next);
    current = next;
  }

  return dates;
}

export async function spawnAllRecurrenceTasks(
  prisma: PrismaClient,
  task: TaskWithRule,
  assigneeIds: string[],
): Promise<number> {
  const series = await resolveRecurrenceSeries(prisma, task);
  if (!series) return 0;

  const seriesId = series.id;
  const existingTasks = await prisma.task.findMany({
    where: { recurrenceSeriesId: seriesId },
    select: { dueDate: true },
  });

  const existingDueDays = new Set(
    existingTasks
      .map((row) => (row.dueDate ? dueDayKey(row.dueDate) : null))
      .filter((day): day is string => day != null),
  );

  const anchorDue =
    existingTasks
      .map((row) => row.dueDate)
      .filter((date): date is Date => date != null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ??
    task.dueDate ??
    new Date();

  const futureDueDates = listFutureRecurrenceDueDates(
    series.type,
    series.interval,
    anchorDue,
    series.daysOfWeek,
    series.dayOfMonth,
  ).filter((dueDate) => !existingDueDays.has(dueDayKey(dueDate)));

  if (futureDueDates.length === 0) return 0;

  for (let i = 0; i < futureDueDates.length; i += RECURRENCE_SPAWN_CHUNK) {
    const chunk = futureDueDates.slice(i, i + RECURRENCE_SPAWN_CHUNK);
    await prisma.$transaction(
      chunk.map((dueDate) =>
        prisma.task.create({
          data: {
            title: series.title,
            description: series.description,
            priority: series.priority,
            status: "todo",
            dueDate,
            teamId: task.teamId,
            creatorId: task.creatorId,
            incognito: series.incognito,
            isJoint: series.isJoint,
            attachmentUrl: series.attachmentUrl,
            recurrenceSeriesId: seriesId,
            ...(assigneeIds.length > 0
              ? { assignments: { create: assigneeIds.map((userId) => ({ userId })) } }
              : {}),
          },
        }),
      ),
    );
  }

  await prisma.recurrenceSeries.update({
    where: { id: seriesId },
    data: { updatedAt: new Date() },
  });

  return futureDueDates.length;
}

/** Materialize missing future occurrences for recurring series in a team (legacy backfill). */
export async function materializeRecurringTasksForTeam(prisma: PrismaClient, teamId: string): Promise<void> {
  const anchors = await prisma.task.findMany({
    where: {
      teamId,
      OR: [{ recurrenceSeriesId: { not: null } }, { recurrenceRule: { isNot: null } }],
    },
    include: {
      assignments: { select: { userId: true } },
      recurrenceRule: true,
    },
    orderBy: [{ recurrenceSeriesId: "asc" }, { dueDate: "asc" }],
  });

  const seenSeries = new Set<string>();
  for (const task of anchors) {
    const seriesKey = task.recurrenceSeriesId ?? `rule:${task.id}`;
    if (seenSeries.has(seriesKey)) continue;
    seenSeries.add(seriesKey);
    await spawnAllRecurrenceTasks(
      prisma,
      task,
      task.assignments.map((assignment) => assignment.userId),
    );
  }
}

/** @deprecated Use spawnAllRecurrenceTasks — kept for compatibility with one-off backfills */
export async function spawnNextRecurrenceTask(
  prisma: PrismaClient,
  task: TaskWithRule,
  assigneeIds: string[],
): Promise<void> {
  await spawnAllRecurrenceTasks(prisma, task, assigneeIds);
}

export async function deleteTaskWithScope(
  prisma: PrismaClient,
  task: TaskWithRule,
  scope: RecurrenceScope,
): Promise<void> {
  if (scope === "series" && isRecurringTask(task)) {
    const series = await resolveRecurrenceSeries(prisma, task);
    if (series) {
      await prisma.recurrenceSeries.delete({ where: { id: series.id } });
      return;
    }
  }
  await prisma.task.delete({ where: { id: task.id } });
}

type SeriesPatch = {
  title?: string;
  description?: string | null;
  priority?: string;
};

export async function updateTaskWithSeriesScope(
  prisma: PrismaClient,
  task: TaskWithRule,
  scope: RecurrenceScope,
  patch: SeriesPatch,
): Promise<void> {
  if (scope !== "series" || !isRecurringTask(task)) return;

  const series = await resolveRecurrenceSeries(prisma, task);
  if (!series) return;

  const seriesData: Prisma.RecurrenceSeriesUpdateInput = {};
  if (patch.title !== undefined) seriesData.title = patch.title.trim();
  if (patch.description !== undefined) seriesData.description = patch.description?.trim() ?? null;
  if (patch.priority !== undefined) seriesData.priority = patch.priority;

  if (Object.keys(seriesData).length > 0) {
    await prisma.recurrenceSeries.update({
      where: { id: series.id },
      data: seriesData,
    });
  }

  const taskData: Prisma.TaskUpdateManyMutationInput = {};
  if (patch.title !== undefined) taskData.title = patch.title.trim();
  if (patch.description !== undefined) taskData.description = patch.description?.trim() ?? null;
  if (patch.priority !== undefined) taskData.priority = patch.priority;

  if (Object.keys(taskData).length > 0) {
    await prisma.task.updateMany({
      where: {
        recurrenceSeriesId: series.id,
        status: { not: "done" },
      },
      data: taskData,
    });
  }
}
