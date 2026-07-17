import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";

function parseDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6);
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
    hour12: false,
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

/** Approximate zoned local midnight + minutes → UTC Date. */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const tzPart = fmt.formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMin = 0;
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    offsetMin = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  }
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * 60_000 - offsetMin * 60_000;
  return new Date(utcMs);
}

export async function listSchedules(teamId: string, templateId?: string) {
  return prisma.walkSchedule.findMany({
    where: {
      template: { teamId },
      ...(templateId ? { templateId } : {}),
    },
    include: {
      windows: { orderBy: { sortOrder: "asc" } },
      template: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSchedule(input: {
  teamId: string;
  templateId: string;
  name?: string | null;
  timezone?: string;
  recurrence?: string;
  daysOfWeek?: number[] | null;
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
    where: { id: input.templateId, teamId: input.teamId, status: "PUBLISHED" },
  });
  if (!template) return { error: "NOT_FOUND" as const, message: "Published walk required" };
  if (!input.windows.length) {
    return { error: "VALIDATION" as const, message: "Add at least one time window" };
  }

  const latestVersion = await prisma.walkTemplateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { version: "desc" },
  });

  const schedule = await prisma.walkSchedule.create({
    data: {
      templateId: template.id,
      templateVersionId: latestVersion?.id ?? null,
      name: input.name?.trim() || null,
      timezone: input.timezone ?? "America/New_York",
      recurrence: input.recurrence ?? "DAILY",
      daysOfWeek: (input.daysOfWeek ?? undefined) as Prisma.InputJsonValue | undefined,
      effectiveFrom: input.effectiveFrom ?? new Date(),
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

  await materializeOccurrencesForSchedule(schedule.id, 14);
  return { ok: true as const, schedule };
}

export async function materializeOccurrencesForSchedule(scheduleId: string, daysAhead = 14) {
  const schedule = await prisma.walkSchedule.findFirst({
    where: { id: scheduleId, isActive: true },
    include: {
      windows: { orderBy: { sortOrder: "asc" } },
      template: { select: { teamId: true, id: true } },
    },
  });
  if (!schedule || !schedule.windows.length) return { created: 0 };

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

  for (let offset = 0; offset <= daysAhead; offset++) {
    const dayUtc = new Date(now.getTime() + offset * 86_400_000);
    const parts = localDateParts(dayUtc, schedule.timezone);
    if (schedule.recurrence === "WEEKLY" && days && !days.includes(parts.weekday)) continue;
    if (schedule.recurrence === "ONCE" && offset > 0) continue;

    for (const window of schedule.windows) {
      const windowStart = zonedLocalToUtc(
        parts.year,
        parts.month,
        parts.day,
        window.startMinutes,
        schedule.timezone,
      );
      if (windowStart < schedule.effectiveFrom) continue;
      if (schedule.effectiveTo && windowStart > schedule.effectiveTo) continue;

      const dueAt = zonedLocalToUtc(
        parts.year,
        parts.month,
        parts.day,
        window.dueMinutes,
        schedule.timezone,
      );
      const graceEndsAt = new Date(dueAt.getTime() + window.graceMinutes * 60_000);
      const status = now < windowStart ? "UPCOMING" : now <= graceEndsAt ? "AVAILABLE" : "MISSED";

      try {
        await prisma.walkOccurrence.create({
          data: {
            teamId: schedule.template.teamId,
            scheduleId: schedule.id,
            scheduleWindowId: window.id,
            templateId: schedule.templateId,
            templateVersionId,
            windowStart,
            dueAt,
            graceEndsAt,
            status: status === "MISSED" && now < windowStart ? "UPCOMING" : status,
            assignScope: schedule.assignScope,
            assignRole: schedule.assignRole,
            assignUserIds: schedule.assignUserIds ?? undefined,
          },
        });
        created += 1;
      } catch {
        // unique constraint — already materialized
      }
    }
  }
  return { created };
}

export async function materializeAllActiveSchedules(daysAhead = 14, teamId?: string) {
  const schedules = await prisma.walkSchedule.findMany({
    where: {
      isActive: true,
      ...(teamId ? { template: { teamId } } : {}),
    },
    select: { id: true },
  });
  let created = 0;
  for (const s of schedules) {
    try {
      const r = await materializeOccurrencesForSchedule(s.id, daysAhead);
      created += r.created;
    } catch (err) {
      console.error("materializeOccurrencesForSchedule failed", s.id, err);
    }
  }
  return { schedules: schedules.length, created };
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

export async function listOccurrences(
  teamId: string,
  opts?: { from?: Date; to?: Date; status?: string; templateId?: string },
) {
  try {
    await refreshOccurrenceStatuses(teamId);
  } catch (err) {
    console.error("refreshOccurrenceStatuses failed", err);
  }
  return prisma.walkOccurrence.findMany({
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
    include: {
      template: { select: { id: true, name: true } },
      schedule: { select: { id: true, name: true, timezone: true } },
    },
    orderBy: { windowStart: "asc" },
    take: 200,
  });
}

export async function listAvailableOccurrences(teamId: string) {
  await refreshOccurrenceStatuses(teamId);
  await materializeAllActiveSchedules(7, teamId);
  return prisma.walkOccurrence.findMany({
    where: {
      teamId,
      status: { in: ["AVAILABLE", "IN_PROGRESS"] },
    },
    include: {
      template: { select: { id: true, name: true, description: true } },
      schedule: { select: { id: true, name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 50,
  });
}
