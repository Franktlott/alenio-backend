import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";

function parseDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6);
}

const DAY_MINUTES = 24 * 60;

/** Reject overlapping completion windows (open → due + grace). Adjacent endpoints are allowed. */
function validateWindowsDoNotOverlap(
  windows: Array<{ startMinutes: number; dueMinutes: number; graceMinutes?: number }>,
): string | null {
  if (windows.length < 2) return null;
  const ranges = windows
    .map((w) => {
      const open = Math.max(0, Math.min(DAY_MINUTES, w.startMinutes));
      const close = Math.max(
        open,
        Math.min(DAY_MINUTES, w.dueMinutes + (w.graceMinutes ?? 0)),
      );
      return { open, close, dueMinutes: w.dueMinutes };
    })
    .sort((a, b) => a.open - b.open || a.close - b.close);

  for (let i = 0; i < ranges.length - 1; i += 1) {
    const current = ranges[i]!;
    const next = ranges[i + 1]!;
    if (current.open < next.close && next.open < current.close) {
      return "Completion windows overlap. Adjust due times or before/after windows so they do not overlap.";
    }
  }
  return null;
}

function localDateParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

/** Local calendar day (in `timeZone`) at 00:00 as a UTC Date. */
function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = localDateParts(date, timeZone);
  return zonedLocalToUtc(parts.year, parts.month, parts.day, 0, timeZone);
}

/**
 * Convert a wall-clock local time in `timeZone` to a real UTC Date.
 * Iteratively corrects zone offset (handles DST; does not rely on GMT± labels).
 */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const read = (ms: number) => {
    const parts = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  };

  // Initial guess: treat wall time as UTC, then nudge until TZ wall matches.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const actual = read(guess);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const delta = desiredAsUtc - actualAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** Pure helper for INTERVAL materialization (unit-tested). */
export function intervalStartMinutesForDay(input: {
  intervalMinutes: number | null | undefined;
  dayStartMinutes: number;
  dayEndMinutes: number;
}): number[] {
  const intervalMinutes = Math.max(15, input.intervalMinutes ?? 240);
  let endBound = input.dayEndMinutes;
  if (endBound === input.dayStartMinutes) endBound = 1439;
  const starts: number[] = [];
  for (let startMin = input.dayStartMinutes; startMin < endBound; startMin += intervalMinutes) {
    starts.push(startMin);
  }
  return starts;
}

export async function listSchedules(teamId: string, templateId?: string) {
  const schedules = await prisma.walkSchedule.findMany({
    where: {
      template: { teamId },
      ...(templateId ? { templateId } : {}),
    },
    include: {
      windows: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  const templateIds = [...new Set(schedules.map((s) => s.templateId))];
  const templates = templateIds.length
    ? await prisma.walkTemplate.findMany({
        where: { teamId, id: { in: templateIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const byId = new Map(templates.map((t) => [t.id, t]));
  return schedules.map((s) => ({
    ...s,
    template: byId.get(s.templateId) ?? { id: s.templateId, name: s.name ?? "Walk", status: "PUBLISHED" },
  }));
}

export async function createSchedule(input: {
  teamId: string;
  templateId: string;
  name?: string | null;
  timezone?: string;
  recurrence?: string;
  daysOfWeek?: number[] | null;
  intervalMinutes?: number | null;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  assignScope?: string;
  assignRole?: string | null;
  assignUserIds?: string[] | null;
  completionMode?: string;
  claimMode?: string;
  managerApprovalRequired?: boolean;
  requiredCompletionCount?: number;
  missedBehavior?: string;
  notifyEnabled?: boolean;
  windows: Array<{ startMinutes: number; dueMinutes: number; graceMinutes?: number }>;
}) {
  const template = await prisma.walkTemplate.findFirst({
    where: { id: input.templateId, teamId: input.teamId, status: { in: ["DRAFT", "PUBLISHED"] } },
  });
  if (!template) return { error: "NOT_FOUND" as const, message: "Walk not found" };
  if (!input.windows.length) {
    return { error: "VALIDATION" as const, message: "Add at least one time window" };
  }
  const overlapMessage = validateWindowsDoNotOverlap(input.windows);
  if (overlapMessage) {
    return { error: "VALIDATION" as const, message: overlapMessage };
  }
  if (
    input.recurrence === "INTERVAL" &&
    input.intervalMinutes != null &&
    input.intervalMinutes < 15
  ) {
    return { error: "VALIDATION" as const, message: "intervalMinutes must be at least 15" };
  }

  const latestVersion =
    template.status === "PUBLISHED"
      ? await prisma.walkTemplateVersion.findFirst({
          where: { templateId: template.id },
          orderBy: { version: "desc" },
        })
      : null;

  const timezone = input.timezone ?? "America/New_York";
  const schedule = await prisma.walkSchedule.create({
    data: {
      templateId: template.id,
      templateVersionId: latestVersion?.id ?? null,
      name: input.name?.trim() || null,
      timezone,
      recurrence: input.recurrence ?? "DAILY",
      daysOfWeek: (input.daysOfWeek ?? undefined) as Prisma.InputJsonValue | undefined,
      intervalMinutes: input.intervalMinutes ?? null,
      // Start of local day so creating a schedule mid-window still opens today's check.
      effectiveFrom: input.effectiveFrom ?? startOfZonedDay(new Date(), timezone),
      effectiveTo: input.effectiveTo ?? null,
      assignScope: input.assignScope ?? "WORKSPACE",
      assignRole: input.assignRole ?? null,
      assignUserIds: (input.assignUserIds ?? undefined) as Prisma.InputJsonValue | undefined,
      completionMode: input.completionMode ?? "ANY_ONE",
      claimMode: input.claimMode ?? "FIRST_START_OWNS",
      managerApprovalRequired: input.managerApprovalRequired ?? false,
      requiredCompletionCount: input.requiredCompletionCount ?? 1,
      missedBehavior: input.missedBehavior ?? "MARK_MISSED",
      notifyEnabled: input.notifyEnabled ?? true,
      windows: {
        create: input.windows.map((w, index) => ({
          startMinutes: w.startMinutes,
          dueMinutes: w.dueMinutes,
          graceMinutes: w.graceMinutes ?? 0,
          sortOrder: index,
        })),
      },
    },
    include: { windows: { orderBy: { sortOrder: "asc" } } },
  });

  if (template.status === "PUBLISHED" && schedule.isActive) {
    await materializeOccurrencesForSchedule(schedule.id, 14);
  }
  return { ok: true as const, schedule };
}

async function getOwnedSchedule(teamId: string, scheduleId: string) {
  return prisma.walkSchedule.findFirst({
    where: { id: scheduleId, template: { teamId } },
    include: { windows: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updateSchedule(
  teamId: string,
  scheduleId: string,
  input: {
    name?: string | null;
    timezone?: string;
    recurrence?: string;
    daysOfWeek?: number[] | null;
    intervalMinutes?: number | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    assignScope?: string;
    assignRole?: string | null;
    assignUserIds?: string[] | null;
    completionMode?: string;
    claimMode?: string;
    managerApprovalRequired?: boolean;
    requiredCompletionCount?: number;
    missedBehavior?: string;
    notifyEnabled?: boolean;
    isActive?: boolean;
    windows?: Array<{ startMinutes: number; dueMinutes: number; graceMinutes?: number }>;
  },
) {
  const existing = await getOwnedSchedule(teamId, scheduleId);
  if (!existing) return { error: "NOT_FOUND" as const, message: "Schedule not found" };

  if (input.windows && !input.windows.length) {
    return { error: "VALIDATION" as const, message: "Add at least one time window" };
  }
  if (input.windows) {
    const overlapMessage = validateWindowsDoNotOverlap(input.windows);
    if (overlapMessage) {
      return { error: "VALIDATION" as const, message: overlapMessage };
    }
  }

  const schedule = await prisma.$transaction(async (tx) => {
    if (input.windows) {
      await tx.walkScheduleWindow.deleteMany({ where: { scheduleId } });
    }
    return tx.walkSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
        ...(input.daysOfWeek !== undefined
          ? { daysOfWeek: (input.daysOfWeek ?? undefined) as Prisma.InputJsonValue | undefined }
          : {}),
        ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
        ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
        ...(input.effectiveTo !== undefined ? { effectiveTo: input.effectiveTo } : {}),
        ...(input.assignScope !== undefined ? { assignScope: input.assignScope } : {}),
        ...(input.assignRole !== undefined ? { assignRole: input.assignRole } : {}),
        ...(input.assignUserIds !== undefined
          ? {
              assignUserIds: (input.assignUserIds ?? undefined) as
                | Prisma.InputJsonValue
                | undefined,
            }
          : {}),
        ...(input.completionMode !== undefined ? { completionMode: input.completionMode } : {}),
        ...(input.claimMode !== undefined ? { claimMode: input.claimMode } : {}),
        ...(input.managerApprovalRequired !== undefined
          ? { managerApprovalRequired: input.managerApprovalRequired }
          : {}),
        ...(input.requiredCompletionCount !== undefined
          ? { requiredCompletionCount: input.requiredCompletionCount }
          : {}),
        ...(input.missedBehavior !== undefined ? { missedBehavior: input.missedBehavior } : {}),
        ...(input.notifyEnabled !== undefined ? { notifyEnabled: input.notifyEnabled } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.windows
          ? {
              windows: {
                create: input.windows.map((w, index) => ({
                  startMinutes: w.startMinutes,
                  dueMinutes: w.dueMinutes,
                  graceMinutes: w.graceMinutes ?? 0,
                  sortOrder: index,
                })),
              },
            }
          : {}),
      },
      include: { windows: { orderBy: { sortOrder: "asc" } } },
    });
  });

  const template = await prisma.walkTemplate.findFirst({
    where: { id: schedule.templateId, teamId },
    select: { id: true, name: true, status: true },
  });

  if (schedule.isActive && template?.status === "PUBLISHED") {
    await materializeOccurrencesForSchedule(schedule.id, 14);
  } else if (!schedule.isActive) {
    // Pause: cancel future open occurrences so Temps stops offering them.
    await prisma.walkOccurrence.updateMany({
      where: {
        scheduleId: schedule.id,
        runId: null,
        status: { in: ["UPCOMING", "AVAILABLE"] },
      },
      data: { status: "CANCELLED" },
    });
  }

  return {
    ok: true as const,
    schedule: {
      ...schedule,
      template: template ?? { id: schedule.templateId, name: schedule.name ?? "Walk", status: "PUBLISHED" },
    },
  };
}

export async function deleteSchedule(teamId: string, scheduleId: string) {
  const existing = await getOwnedSchedule(teamId, scheduleId);
  if (!existing) return { error: "NOT_FOUND" as const, message: "Schedule not found" };

  await prisma.walkSchedule.delete({ where: { id: scheduleId } });
  return { ok: true as const };
}

export async function materializeOccurrencesForSchedule(scheduleId: string, daysAhead = 14) {
  const schedule = await prisma.walkSchedule.findFirst({
    where: { id: scheduleId, isActive: true },
    include: {
      windows: { orderBy: { sortOrder: "asc" } },
      template: { select: { teamId: true, id: true, status: true } },
    },
  });
  if (!schedule || !schedule.windows.length) return { created: 0 };
  if (schedule.template.status !== "PUBLISHED") return { created: 0 };

  let templateVersionId = schedule.templateVersionId;
  if (!templateVersionId) {
    const latest = await prisma.walkTemplateVersion.findFirst({
      where: { templateId: schedule.templateId },
      orderBy: { version: "desc" },
    });
    templateVersionId = latest?.id ?? null;
  }
  if (!templateVersionId) return { created: 0 };

  const days = parseDays(schedule.daysOfWeek);
  const now = new Date();
  let created = 0;
  const rangeStart = startOfZonedDay(now, schedule.timezone);
  const rangeEnd = new Date(rangeStart.getTime() + (daysAhead + 2) * 86_400_000);
  const expectedStarts: Date[] = [];

  const upsertOccurrence = async (opts: {
    windowStart: Date;
    dueAt: Date;
    graceEndsAt: Date;
    scheduleWindowId: string;
  }) => {
    const { windowStart, dueAt, graceEndsAt, scheduleWindowId } = opts;
    if (graceEndsAt < schedule.effectiveFrom) return;
    if (schedule.effectiveTo && windowStart > schedule.effectiveTo) return;

    expectedStarts.push(windowStart);
    const status = now < windowStart ? "UPCOMING" : now <= graceEndsAt ? "AVAILABLE" : "MISSED";

    const existing = await prisma.walkOccurrence.findUnique({
      where: {
        scheduleId_windowStart: { scheduleId, windowStart },
      },
    });

    if (existing) {
      if (!existing.runId) {
        await prisma.walkOccurrence.update({
          where: { id: existing.id },
          data: {
            dueAt,
            graceEndsAt,
            status,
            scheduleWindowId,
            templateVersionId,
            assignScope: schedule.assignScope,
            assignRole: schedule.assignRole,
          },
        });
      }
      return;
    }

    try {
      await prisma.walkOccurrence.create({
        data: {
          teamId: schedule.template.teamId,
          scheduleId: schedule.id,
          scheduleWindowId,
          templateId: schedule.templateId,
          templateVersionId,
          windowStart,
          dueAt,
          graceEndsAt,
          status,
          assignScope: schedule.assignScope,
          assignRole: schedule.assignRole,
          assignUserIds: schedule.assignUserIds ?? undefined,
        },
      });
      created += 1;
    } catch (err) {
      console.warn("walk occurrence create skipped", scheduleId, err);
    }
  };

  for (let offset = 0; offset <= daysAhead; offset++) {
    // Step by calendar day in the schedule timezone (not raw UTC+24h).
    const dayProbe = new Date(rangeStart.getTime() + offset * 86_400_000 + 12 * 3_600_000);
    const parts = localDateParts(dayProbe, schedule.timezone);
    if (
      (schedule.recurrence === "WEEKLY" || schedule.recurrence === "INTERVAL") &&
      days &&
      !days.includes(parts.weekday)
    ) {
      continue;
    }
    if (schedule.recurrence === "ONCE" && offset > 0) continue;

    if (schedule.recurrence === "INTERVAL") {
      const intervalMinutes = Math.max(15, schedule.intervalMinutes ?? 240);
      const window = schedule.windows[0]!;
      const windowDuration = window.dueMinutes - window.startMinutes;
      const dueSpanMinutes = windowDuration <= 0 ? intervalMinutes : windowDuration;
      const starts = intervalStartMinutesForDay({
        intervalMinutes: schedule.intervalMinutes,
        dayStartMinutes: window.startMinutes,
        dayEndMinutes: window.dueMinutes,
      });

      for (const startMin of starts) {
        const windowStart = zonedLocalToUtc(
          parts.year,
          parts.month,
          parts.day,
          startMin,
          schedule.timezone,
        );
        const dueAt = new Date(windowStart.getTime() + dueSpanMinutes * 60_000);
        const graceEndsAt = new Date(dueAt.getTime() + window.graceMinutes * 60_000);
        await upsertOccurrence({
          windowStart,
          dueAt,
          graceEndsAt,
          scheduleWindowId: window.id,
        });
      }
      continue;
    }

    for (const window of schedule.windows) {
      const windowStart = zonedLocalToUtc(
        parts.year,
        parts.month,
        parts.day,
        window.startMinutes,
        schedule.timezone,
      );
      let dueAt = zonedLocalToUtc(
        parts.year,
        parts.month,
        parts.day,
        window.dueMinutes,
        schedule.timezone,
      );
      // Overnight windows (e.g. 11:30 PM → 1:00 AM).
      if (dueAt <= windowStart) {
        dueAt = new Date(dueAt.getTime() + 86_400_000);
      }
      const graceEndsAt = new Date(dueAt.getTime() + window.graceMinutes * 60_000);

      await upsertOccurrence({
        windowStart,
        dueAt,
        graceEndsAt,
        scheduleWindowId: window.id,
      });
    }
  }

  // Remove stale open rows (e.g. old wrong-timezone starts) without touching IDs still in use.
  if (expectedStarts.length) {
    await prisma.walkOccurrence.deleteMany({
      where: {
        scheduleId,
        runId: null,
        windowStart: { gte: rangeStart, lte: rangeEnd, notIn: expectedStarts },
      },
    });
  }

  return { created };
}

export async function getOccurrenceForTeam(teamId: string, occurrenceId: string) {
  return prisma.walkOccurrence.findFirst({
    where: { id: occurrenceId, teamId },
  });
}

export async function materializeAllActiveSchedules(daysAhead = 14, teamId?: string) {
  const schedules = await prisma.walkSchedule.findMany({
    where: {
      isActive: true,
      template: {
        status: "PUBLISHED",
        ...(teamId ? { teamId } : {}),
      },
    },
    select: { id: true },
  });
  const results = await Promise.all(
    schedules.map(async (s) => {
      try {
        return await materializeOccurrencesForSchedule(s.id, daysAhead);
      } catch (err) {
        console.error("materializeOccurrencesForSchedule failed", s.id, err);
        return { created: 0 };
      }
    }),
  );
  const created = results.reduce((sum, r) => sum + r.created, 0);
  return { schedules: schedules.length, created };
}

/** In-process throttle so list endpoints don't rematerialize on every Temps/Go open. */
const ENSURE_TTL_MS = 3 * 60 * 1000;
const lastEnsureByTeam = new Map<string, number>();

/**
 * Lazily create today's / near-term windows at most once per TTL per team.
 * Schedule create/update still materializes immediately.
 */
export async function ensureOccurrencesForTeam(
  teamId: string,
  daysAhead = 2,
  opts?: { force?: boolean },
) {
  const now = Date.now();
  const last = lastEnsureByTeam.get(teamId) ?? 0;
  if (!opts?.force && now - last < ENSURE_TTL_MS) {
    return { skipped: true as const, schedules: 0, created: 0 };
  }
  lastEnsureByTeam.set(teamId, now);
  try {
    const result = await materializeAllActiveSchedules(daysAhead, teamId);
    return { skipped: false as const, ...result };
  } catch (err) {
    lastEnsureByTeam.delete(teamId);
    throw err;
  }
}

export async function refreshOccurrenceStatuses(teamId?: string) {
  const now = new Date();
  await prisma.walkOccurrence.updateMany({
    where: {
      ...(teamId ? { teamId } : {}),
      status: "UPCOMING",
      windowStart: { lte: now },
      graceEndsAt: { gte: now },
    },
    data: { status: "AVAILABLE" },
  });
  await prisma.walkOccurrence.updateMany({
    where: {
      ...(teamId ? { teamId } : {}),
      status: { in: ["UPCOMING", "AVAILABLE"] },
      graceEndsAt: { lt: now },
      runId: null,
    },
    data: { status: "MISSED" },
  });
}

/** Attach template/schedule without Prisma required-relation includes (orphans break those). */
async function attachOccurrenceRelations<T extends { templateId: string; scheduleId: string }>(
  rows: T[],
  opts?: { includeTemplateDescription?: boolean },
) {
  if (!rows.length) return [];
  const templateIds = [...new Set(rows.map((r) => r.templateId))];
  const scheduleIds = [...new Set(rows.map((r) => r.scheduleId))];
  const [templates, schedules] = await Promise.all([
    prisma.walkTemplate.findMany({
      where: { id: { in: templateIds } },
      select: opts?.includeTemplateDescription
        ? { id: true, name: true, description: true }
        : { id: true, name: true },
    }),
    prisma.walkSchedule.findMany({
      where: { id: { in: scheduleIds } },
      select: { id: true, name: true, timezone: true },
    }),
  ]);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  // Drop orphan occurrences whose walk/schedule was deleted (keeps Temps/Schedule pages healthy).
  const orphanIds = rows
    .filter((r) => !templateById.has(r.templateId) || !scheduleById.has(r.scheduleId))
    .map((r) => (r as T & { id?: string }).id)
    .filter((id): id is string => typeof id === "string");
  if (orphanIds.length) {
    await prisma.walkOccurrence.deleteMany({ where: { id: { in: orphanIds } } }).catch((err) => {
      console.warn("Failed to delete orphan WalkOccurrence rows", err);
    });
  }

  return rows
    .filter((r) => templateById.has(r.templateId) && scheduleById.has(r.scheduleId))
    .map((r) => ({
      ...r,
      template: templateById.get(r.templateId)!,
      schedule: scheduleById.get(r.scheduleId)!,
    }));
}

export async function listOccurrences(
  teamId: string,
  opts?: { from?: Date; to?: Date; status?: string; templateId?: string },
) {
  try {
    await refreshOccurrenceStatuses(teamId);
  } catch (err) {
    console.error("refreshOccurrenceStatuses failed", err);
  }
  // Throttled ensure — not a full rematerialize on every Temps/Go open.
  try {
    await ensureOccurrencesForTeam(teamId, 2);
  } catch (err) {
    console.error("ensureOccurrencesForTeam failed", err);
  }
  const rows = await prisma.walkOccurrence.findMany({
    where: {
      teamId,
      ...(opts?.templateId ? { templateId: opts.templateId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.from || opts?.to
        ? {
            windowStart: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { windowStart: "asc" },
    take: 200,
  });
  return attachOccurrenceRelations(rows);
}

export async function listAvailableOccurrences(teamId: string) {
  try {
    await refreshOccurrenceStatuses(teamId);
  } catch (err) {
    console.error("refreshOccurrenceStatuses failed", err);
  }
  // Reuse the same throttle — do not run a second full materialize after listOccurrences.
  try {
    await ensureOccurrencesForTeam(teamId, 2);
  } catch (err) {
    console.error("ensureOccurrencesForTeam failed", err);
  }
  const rows = await prisma.walkOccurrence.findMany({
    where: {
      teamId,
      status: { in: ["AVAILABLE", "IN_PROGRESS"] },
    },
    orderBy: { dueAt: "asc" },
    take: 50,
  });
  return attachOccurrenceRelations(rows, { includeTemplateDescription: true });
}
