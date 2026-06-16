import type { Prisma, PrismaClient, RecurrenceRule, RecurrenceSeries, Task } from "@prisma/client";
import {
  addCalendarDaysInTimeZone,
  calendarDayFromInstant,
  DEFAULT_TIMEZONE,
  dueInstantFromCalendarDay,
  getZonedDayOfWeek,
  resolveTimeZone,
} from "./timezone";

export type RecurrenceScope = "task" | "series";

export type RecurrenceInput = {
  type: string;
  /** Total number of task instances in the series (including the first). */
  occurrenceCount?: number;
  /** @deprecated Use occurrenceCount — kept for older clients. */
  interval?: number;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
  timeZone?: string | null;
};

type TaskWithRule = Task & { recurrenceRule?: RecurrenceRule | null };

export const RECURRENCE_STEP_INTERVAL = 1;
export const RECURRENCE_MAX_OCCURRENCES = 52;
const RECURRENCE_SPAWN_CHUNK = 25;

export function normalizeOccurrenceCount(raw?: number | null): number {
  const n = Math.floor(raw ?? 1);
  return Math.min(RECURRENCE_MAX_OCCURRENCES, Math.max(1, n));
}

export function resolveRecurrenceOccurrenceCount(
  recurrence: Pick<RecurrenceInput, "occurrenceCount" | "interval">,
): number {
  return normalizeOccurrenceCount(recurrence.occurrenceCount ?? recurrence.interval);
}

export function seriesOccurrenceCount(series: Pick<RecurrenceSeries, "occurrenceCount" | "interval">): number {
  if (series.occurrenceCount != null && series.occurrenceCount > 0) {
    return normalizeOccurrenceCount(series.occurrenceCount);
  }
  return normalizeOccurrenceCount(series.interval);
}

export function dueDayKey(date: Date, timeZone?: string | null): string {
  return calendarDayFromInstant(date, resolveTimeZone(timeZone));
}

/** Parse a calendar due date in the user's timezone. */
export function parseCalendarDueDate(input: string | Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return dueInstantFromCalendarDay(match[0], timeZone);
    }
  }
  const date = input instanceof Date ? input : new Date(input);
  const day = calendarDayFromInstant(date, timeZone);
  return day ? dueInstantFromCalendarDay(day, timeZone) : date;
}

/** Snap the series start to the chosen weekday / day-of-month before spawning. */
export function alignRecurringAnchorDueDate(
  type: string,
  dueDate: Date,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const tz = resolveTimeZone(timeZone);
  const anchor = parseCalendarDueDate(dueDate, tz);
  if (type === "weekly" && daysOfWeek != null && daysOfWeek !== "") {
    const targetDay = parseInt(daysOfWeek, 10);
    const currentDay = getZonedDayOfWeek(anchor, tz);
    const diff = (targetDay - currentDay + 7) % 7;
    if (diff === 0) return anchor;
    return addCalendarDaysInTimeZone(anchor, diff, tz);
  }
  if (type === "monthly" && dayOfMonth != null) {
    const parts = calendarDayFromInstant(anchor, tz).split("-").map(Number);
    const [y, mo] = parts;
    const daysInMonth = new Date(Date.UTC(y!, mo!, 0)).getUTCDate();
    const day = Math.min(dayOfMonth, daysInMonth);
    return dueInstantFromCalendarDay(
      `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      tz,
    );
  }
  return anchor;
}

export function getNextDueDate(
  type: string,
  interval: number,
  fromDate: Date,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const tz = resolveTimeZone(timeZone);
  switch (type) {
    case "daily":
      return addCalendarDaysInTimeZone(fromDate, interval, tz);
    case "weekly":
      return addCalendarDaysInTimeZone(fromDate, 7 * interval, tz);
    case "monthly": {
      const currentDay = calendarDayFromInstant(fromDate, tz);
      const [y, mo, d] = currentDay.split("-").map(Number);
      const rawMonth = (mo! - 1) + interval;
      const targetYear = y! + Math.floor(rawMonth / 12);
      const targetMonth = ((rawMonth % 12) + 12) % 12 + 1;
      const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
      const targetDay =
        dayOfMonth != null ? Math.min(dayOfMonth, daysInTargetMonth) : Math.min(d!, daysInTargetMonth);
      return dueInstantFromCalendarDay(
        `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`,
        tz,
      );
    }
    default:
      return addCalendarDaysInTimeZone(fromDate, interval, tz);
  }
  void daysOfWeek;
}

export function isRecurringTask(task: Pick<Task, "recurrenceSeriesId"> & { recurrenceRule?: RecurrenceRule | null }) {
  return !!(task.recurrenceSeriesId || task.recurrenceRule);
}

export async function createRecurrenceSeries(
  prisma: PrismaClient,
  task: Pick<Task, "teamId" | "creatorId" | "title" | "description" | "priority" | "incognito" | "isJoint" | "attachmentUrl">,
  recurrence: RecurrenceInput,
): Promise<RecurrenceSeries> {
  const occurrenceCount = resolveRecurrenceOccurrenceCount(recurrence);
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
      interval: RECURRENCE_STEP_INTERVAL,
      occurrenceCount,
      daysOfWeek: recurrence.daysOfWeek ?? null,
      dayOfMonth: recurrence.dayOfMonth ?? null,
      timeZone: resolveTimeZone(recurrence.timeZone),
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
    occurrenceCount: task.recurrenceRule.interval,
    daysOfWeek: task.recurrenceRule.daysOfWeek,
    dayOfMonth: task.recurrenceRule.dayOfMonth,
  });
  await prisma.task.update({
    where: { id: task.id },
    data: { recurrenceSeriesId: series.id },
  });
  return series;
}

/** Future due dates after the anchor for a fixed occurrence count (step = 1 unit of type). */
export function listRecurrenceDueDatesForCount(
  type: string,
  anchorDue: Date,
  occurrenceCount: number,
  daysOfWeek?: string | null,
  dayOfMonth?: number | null,
  timeZone: string = DEFAULT_TIMEZONE,
): Date[] {
  const total = normalizeOccurrenceCount(occurrenceCount);
  const maxFuture = Math.max(0, total - 1);
  const anchor = alignRecurringAnchorDueDate(type, anchorDue, daysOfWeek, dayOfMonth, timeZone);
  const dates: Date[] = [];
  let current = anchor;

  while (dates.length < maxFuture) {
    const next = getNextDueDate(type, RECURRENCE_STEP_INTERVAL, current, daysOfWeek, dayOfMonth, timeZone);
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
  const seriesTimeZone = resolveTimeZone(series.timeZone);
  const occurrenceCount = seriesOccurrenceCount(series);
  const existingTasks = await prisma.task.findMany({
    where: { recurrenceSeriesId: seriesId },
    select: { dueDate: true },
  });

  if (existingTasks.length >= occurrenceCount) return 0;

  const existingDueDays = new Set(
    existingTasks
      .map((row) => (row.dueDate ? dueDayKey(row.dueDate, seriesTimeZone) : null))
      .filter((day): day is string => day != null),
  );

  const sortedDueDates = existingTasks
    .map((row) => row.dueDate)
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());

  const anchorDue = sortedDueDates[0] ?? task.dueDate ?? new Date();

  const futureDueDates = listRecurrenceDueDatesForCount(
    series.type,
    anchorDue,
    occurrenceCount,
    series.daysOfWeek,
    series.dayOfMonth,
    seriesTimeZone,
  ).filter((dueDate) => !existingDueDays.has(dueDayKey(dueDate, seriesTimeZone)));

  const remainingSlots = occurrenceCount - existingTasks.length;
  const toCreate = futureDueDates.slice(0, remainingSlots);
  if (toCreate.length === 0) return 0;

  const anchorTask = await prisma.task.findFirst({
    where: { recurrenceSeriesId: seriesId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      subtasks: {
        orderBy: { order: "asc" },
        select: { title: true, order: true },
      },
    },
  });
  const subtaskSeed =
    anchorTask?.subtasks.map((subtask) => ({ title: subtask.title, order: subtask.order })) ?? [];

  for (let i = 0; i < toCreate.length; i += RECURRENCE_SPAWN_CHUNK) {
    const chunk = toCreate.slice(i, i + RECURRENCE_SPAWN_CHUNK);
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
            ...(subtaskSeed.length > 0 ? { subtasks: { create: subtaskSeed } } : {}),
          },
        }),
      ),
    );
  }

  await prisma.recurrenceSeries.update({
    where: { id: seriesId },
    data: { updatedAt: new Date() },
  });

  return toCreate.length;
}

/** Fill missing occurrences up to the series occurrence count. */
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
