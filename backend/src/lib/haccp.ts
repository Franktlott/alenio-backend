import { prisma } from "../prisma";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { canManageGoLoginRequests } from "./go-login-requests";
import { isGoDeviceApproved } from "./workplace-alerts";

export type HaccpTemplateKind =
  | "opening_temps"
  | "hot_hold"
  | "cold_hold"
  | "closing_temps"
  | "custom";

export type HaccpItemStatus = "pass" | "needs_attention" | "na";
export type HaccpRunStatus = "in_progress" | "completed" | "missed";
export type HaccpCorrectiveActionType =
  | "discarded"
  | "moved_cooler"
  | "rapid_chilled"
  | "maintenance"
  | "rechecked_passed"
  | "other";
export type HaccpCoolingStatus = "active" | "passed" | "failed" | "overdue";
export type HaccpBluetoothMode = "required" | "preferred" | "manual_only";

const STARTER_TEMPLATES: Array<{
  name: string;
  kind: HaccpTemplateKind;
  dueLabel: string;
  windowStart: string;
  windowEnd: string;
  items: Array<{ label: string; maxTempF?: number; minTempF?: number; allowNa?: boolean }>;
}> = [
  {
    name: "Opening Temps",
    kind: "opening_temps",
    dueLabel: "Due Now",
    windowStart: "06:00",
    windowEnd: "10:00",
    items: [
      { label: "Turkey", maxTempF: 41 },
      { label: "Ham", maxTempF: 41 },
      { label: "Chicken Salad", maxTempF: 41 },
      { label: "Tuna Salad", maxTempF: 41 },
      { label: "Walk-in Cooler", maxTempF: 41 },
      { label: "Prep Cooler", maxTempF: 41 },
      { label: "Milk", maxTempF: 41 },
      { label: "Eggs", maxTempF: 41 },
      { label: "Sliced Cheese", maxTempF: 41 },
      { label: "Produce Cooler", maxTempF: 41 },
      { label: "Freezer", maxTempF: 0 },
      { label: "Hot Water", minTempF: 120 },
    ],
  },
  {
    name: "Hot Hold Temps",
    kind: "hot_hold",
    dueLabel: "Due 11:00 AM",
    windowStart: "10:30",
    windowEnd: "11:30",
    items: [
      { label: "Soup", minTempF: 135 },
      { label: "Gravy", minTempF: 135 },
      { label: "Rice", minTempF: 135 },
      { label: "Chicken", minTempF: 135 },
    ],
  },
  {
    name: "Cold Hold Temps",
    kind: "cold_hold",
    dueLabel: "Due 2:00 PM",
    windowStart: "13:30",
    windowEnd: "14:30",
    items: [
      { label: "Salad Bar", maxTempF: 41 },
      { label: "Deli Case", maxTempF: 41 },
      { label: "Prep Line", maxTempF: 41 },
    ],
  },
];

export function canManageHaccp(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export async function canManageHaccpForUser(teamId: string, userId: string): Promise<boolean> {
  return canManageGoLoginRequests(teamId, userId);
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const [h, m] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function nowMinutesInTz(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatTempRange(minTempF: number | null, maxTempF: number | null): string {
  if (minTempF != null && maxTempF != null) return `${minTempF}°F – ${maxTempF}°F`;
  if (maxTempF != null) return `${maxTempF}°F or below`;
  if (minTempF != null) return `${minTempF}°F or above`;
  return "No range set";
}

export function evaluateTempReading(
  readingF: number,
  minTempF: number | null,
  maxTempF: number | null,
): HaccpItemStatus {
  if (maxTempF != null && readingF > maxTempF) return "needs_attention";
  if (minTempF != null && readingF < minTempF) return "needs_attention";
  return "pass";
}

async function recordAudit(
  teamId: string,
  eventType: string,
  message: string,
  actorName?: string | null,
  metadata?: Record<string, unknown>,
) {
  await prisma.haccpAuditEvent.create({
    data: {
      teamId,
      eventType,
      message,
      actorName: actorName?.trim().slice(0, 120) || null,
      metadata: metadata ?? undefined,
    },
  });
}

function serializeTemplate(row: {
  id: string;
  teamId: string;
  name: string;
  kind: string;
  workplace: string;
  frequency: string;
  windowStart: string | null;
  windowEnd: string | null;
  dueLabel: string | null;
  photoRequired: boolean;
  noteRequired: boolean;
  bluetoothMode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    label: string;
    minTempF: number | null;
    maxTempF: number | null;
    allowNa: boolean;
    sortOrder: number;
  }>;
}) {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    kind: row.kind as HaccpTemplateKind,
    workplace: row.workplace,
    frequency: row.frequency,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    dueLabel: row.dueLabel,
    photoRequired: row.photoRequired,
    noteRequired: row.noteRequired,
    bluetoothMode: row.bluetoothMode as HaccpBluetoothMode,
    isActive: row.isActive,
    itemCount: row.items.length,
    items: row.items
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        label: item.label,
        minTempF: item.minTempF,
        maxTempF: item.maxTempF,
        tempRangeLabel: formatTempRange(item.minTempF, item.maxTempF),
        allowNa: item.allowNa,
        sortOrder: item.sortOrder,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRunItem(row: {
  id: string;
  runId: string;
  templateItemId: string | null;
  label: string;
  minTempF: number | null;
  maxTempF: number | null;
  allowNa: boolean;
  readingF: number | null;
  status: string | null;
  entryMethod: string | null;
  notes: string | null;
  photoUrl: string | null;
  sortOrder: number;
  completedAt: Date | null;
}) {
  return {
    id: row.id,
    runId: row.runId,
    templateItemId: row.templateItemId,
    label: row.label,
    minTempF: row.minTempF,
    maxTempF: row.maxTempF,
    tempRangeLabel: formatTempRange(row.minTempF, row.maxTempF),
    allowNa: row.allowNa,
    readingF: row.readingF,
    status: row.status as HaccpItemStatus | null,
    entryMethod: row.entryMethod,
    notes: row.notes,
    photoUrl: row.photoUrl,
    sortOrder: row.sortOrder,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function serializeRun(row: {
  id: string;
  teamId: string;
  templateId: string;
  templateName: string;
  kind: string;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  dueLabel: string | null;
  dueAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  completedByUserId: string | null;
  completedByName: string | null;
  deviceId: string | null;
  itemsTotal: number;
  itemsCompleted: number;
  items?: ReturnType<typeof serializeRunItem>[];
}) {
  return {
    id: row.id,
    teamId: row.teamId,
    templateId: row.templateId,
    templateName: row.templateName,
    kind: row.kind as HaccpTemplateKind,
    status: row.status as HaccpRunStatus,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    dueLabel: row.dueLabel,
    dueAt: row.dueAt?.toISOString() ?? null,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByUserId: row.completedByUserId,
    completedByName: row.completedByName,
    deviceId: row.deviceId,
    itemsTotal: row.itemsTotal,
    itemsCompleted: row.itemsCompleted,
    progressPct: row.itemsTotal > 0 ? Math.round((row.itemsCompleted / row.itemsTotal) * 100) : 0,
    items: row.items ?? [],
  };
}

function dueStatusForTemplate(
  template: { windowStart: string | null; windowEnd: string | null; dueLabel: string | null },
  todayRun: { status: string; itemsCompleted: number; itemsTotal: number } | null,
): { status: "due_now" | "due_later" | "completed" | "missed" | "in_progress"; label: string } {
  if (todayRun?.status === "completed") return { status: "completed", label: "Completed" };
  if (todayRun?.status === "in_progress") {
    return {
      status: "in_progress",
      label: `${todayRun.itemsCompleted}/${todayRun.itemsTotal} done`,
    };
  }
  const start = parseTimeToMinutes(template.windowStart);
  const end = parseTimeToMinutes(template.windowEnd);
  const now = nowMinutesInTz();
  if (start != null && end != null) {
    if (now < start) return { status: "due_later", label: template.dueLabel ?? "Scheduled" };
    if (now <= end) return { status: "due_now", label: template.dueLabel ?? "Due Now" };
    return { status: "missed", label: "Missed window" };
  }
  return { status: "due_now", label: template.dueLabel ?? "Due Now" };
}

export async function seedStarterHaccpTemplates(teamId: string, userId: string) {
  const existing = await prisma.haccpTemplate.count({ where: { teamId } });
  if (existing > 0) return { ok: true as const, seeded: false };

  for (const starter of STARTER_TEMPLATES) {
    const template = await prisma.haccpTemplate.create({
      data: {
        teamId,
        name: starter.name,
        kind: starter.kind,
        workplace: "Kitchen",
        dueLabel: starter.dueLabel,
        windowStart: starter.windowStart,
        windowEnd: starter.windowEnd,
        createdByUserId: userId,
        items: {
          create: starter.items.map((item, index) => ({
            label: item.label,
            minTempF: item.minTempF ?? null,
            maxTempF: item.maxTempF ?? null,
            allowNa: item.allowNa ?? false,
            sortOrder: index,
          })),
        },
      },
    });
    await prisma.haccpSchedule.create({
      data: {
        teamId,
        templateId: template.id,
        windowStart: starter.windowStart,
        windowEnd: starter.windowEnd,
        dueLabel: starter.dueLabel,
      },
    });
  }

  await recordAudit(teamId, "setup", "Starter food safety templates were created.");
  return { ok: true as const, seeded: true };
}

export async function getFoodSafetyDashboard(teamId: string) {
  const dayStart = startOfDay();
  const dayEnd = endOfDay();

  const [templates, todayRuns, openActions, coolingActive, latestCalibration, auditEvents] = await Promise.all([
    prisma.haccpTemplate.findMany({
      where: { teamId, isActive: true },
      include: { items: true },
      orderBy: { name: "asc" },
    }),
    prisma.haccpRun.findMany({
      where: { teamId, startedAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.haccpCorrectiveAction.count({ where: { teamId, status: "open" } }),
    prisma.haccpCoolingLog.count({ where: { teamId, status: "active" } }),
    prisma.haccpProbeCalibration.findFirst({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.haccpAuditEvent.findMany({
      where: { teamId, createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const runByTemplate = new Map(todayRuns.map((r) => [r.templateId, r]));
  const tempCards = templates.map((template) => {
    const due = dueStatusForTemplate(template, runByTemplate.get(template.id) ?? null);
    return {
      templateId: template.id,
      name: template.name,
      kind: template.kind,
      dueStatus: due.status,
      dueLabel: due.label,
      itemCount: template.items.length,
      runId: runByTemplate.get(template.id)?.id ?? null,
    };
  });

  const completedChecks = todayRuns.filter((r) => r.status === "completed").length;
  const missedChecks = templates.filter((t) => {
    const due = dueStatusForTemplate(t, runByTemplate.get(t.id) ?? null);
    return due.status === "missed";
  }).length;
  const overdueCooling = await prisma.haccpCoolingLog.count({
    where: { teamId, status: { in: ["active", "overdue"] }, nextReadingDueAt: { lt: new Date() } },
  });

  const scheduledTotal = templates.length;
  const completionPct =
    scheduledTotal > 0 ? Math.round((completedChecks / scheduledTotal) * 100) : 0;

  return {
    stats: {
      completionPct,
      completedChecks,
      missedChecks,
      openCorrectiveActions: openActions,
      overdueItems: overdueCooling + missedChecks,
    },
    cards: {
      tempChecks: tempCards,
      coolingActive,
      probeCalibrationNextDue: latestCalibration?.nextDueAt.toISOString() ?? null,
      openCorrectiveActions: openActions,
    },
    timeline: auditEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      message: e.message,
      actorName: e.actorName,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function listHaccpTemplates(teamId: string) {
  const rows = await prisma.haccpTemplate.findMany({
    where: { teamId, isActive: true },
    include: { items: true },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeTemplate);
}

export async function getHaccpTemplate(teamId: string, templateId: string) {
  const row = await prisma.haccpTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: { items: true },
  });
  if (!row) return { ok: false as const, code: "NOT_FOUND" as const };
  return { ok: true as const, template: serializeTemplate(row) };
}

export async function createHaccpTemplate(
  teamId: string,
  userId: string,
  input: {
    name: string;
    kind: HaccpTemplateKind;
    workplace?: string;
    windowStart?: string | null;
    windowEnd?: string | null;
    dueLabel?: string | null;
    photoRequired?: boolean;
    noteRequired?: boolean;
    bluetoothMode?: HaccpBluetoothMode;
    items: Array<{
      label: string;
      minTempF?: number | null;
      maxTempF?: number | null;
      allowNa?: boolean;
    }>;
  },
) {
  if (!input.items.length) return { ok: false as const, code: "VALIDATION" as const };
  const row = await prisma.haccpTemplate.create({
    data: {
      teamId,
      name: input.name.trim().slice(0, 200),
      kind: input.kind,
      workplace: (input.workplace ?? "Kitchen").trim().slice(0, 200),
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      dueLabel: input.dueLabel ?? null,
      photoRequired: Boolean(input.photoRequired),
      noteRequired: Boolean(input.noteRequired),
      bluetoothMode: input.bluetoothMode ?? "preferred",
      createdByUserId: userId,
      items: {
        create: input.items.map((item, index) => ({
          label: item.label.trim().slice(0, 200),
          minTempF: item.minTempF ?? null,
          maxTempF: item.maxTempF ?? null,
          allowNa: Boolean(item.allowNa),
          sortOrder: index,
        })),
      },
    },
    include: { items: true },
  });
  await recordAudit(teamId, "setup", `Temp check template "${row.name}" was created.`);
  return { ok: true as const, template: serializeTemplate(row) };
}

export async function startHaccpRun(
  teamId: string,
  templateId: string,
  actor: { userId?: string | null; name: string; deviceId?: string | null },
) {
  const template = await prisma.haccpTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };
  if (template.items.length === 0) return { ok: false as const, code: "VALIDATION" as const };

  const dayStart = startOfDay();
  const existing = await prisma.haccpRun.findFirst({
    where: {
      teamId,
      templateId,
      status: "in_progress",
      startedAt: { gte: dayStart },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) {
    return {
      ok: true as const,
      run: serializeRun({
        ...existing,
        items: existing.items.map(serializeRunItem),
      }),
    };
  }

  const run = await prisma.haccpRun.create({
    data: {
      teamId,
      templateId: template.id,
      templateName: template.name,
      kind: template.kind,
      windowStart: template.windowStart,
      windowEnd: template.windowEnd,
      dueLabel: template.dueLabel,
      completedByUserId: actor.userId ?? null,
      completedByName: actor.name.trim().slice(0, 120) || "Associate",
      deviceId: actor.deviceId ?? null,
      itemsTotal: template.items.length,
      items: {
        create: template.items.map((item, index) => ({
          templateItemId: item.id,
          label: item.label,
          minTempF: item.minTempF,
          maxTempF: item.maxTempF,
          allowNa: item.allowNa,
          sortOrder: index,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  await recordAudit(
    teamId,
    "run_started",
    `${template.name} started.`,
    actor.name,
    { templateId: template.id, runId: run.id },
  );

  return {
    ok: true as const,
    run: serializeRun({ ...run, items: run.items.map(serializeRunItem) }),
  };
}

export async function getHaccpRun(teamId: string, runId: string) {
  const run = await prisma.haccpRun.findFirst({
    where: { id: runId, teamId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!run) return { ok: false as const, code: "NOT_FOUND" as const };
  return {
    ok: true as const,
    run: serializeRun({ ...run, items: run.items.map(serializeRunItem) }),
  };
}

export async function completeHaccpRunItem(
  teamId: string,
  runId: string,
  itemId: string,
  input: {
    readingF?: number | null;
    status: HaccpItemStatus;
    entryMethod?: "manual" | "bluetooth";
    notes?: string | null;
    photoUrl?: string | null;
    actorName: string;
  },
) {
  const run = await prisma.haccpRun.findFirst({
    where: { id: runId, teamId, status: "in_progress" },
    include: { items: true },
  });
  if (!run) return { ok: false as const, code: "NOT_FOUND" as const };

  const item = run.items.find((r) => r.id === itemId);
  if (!item) return { ok: false as const, code: "NOT_FOUND" as const };

  let status = input.status;
  if (status !== "na" && input.readingF != null) {
    status = evaluateTempReading(input.readingF, item.minTempF, item.maxTempF);
  }

  const updated = await prisma.haccpRunItem.update({
    where: { id: itemId },
    data: {
      readingF: input.readingF ?? null,
      status,
      entryMethod: input.entryMethod ?? "manual",
      notes: input.notes?.trim().slice(0, 500) || null,
      photoUrl: input.photoUrl ?? null,
      completedAt: new Date(),
    },
  });

  const completedCount = run.items.filter((r) => (r.id === itemId ? true : Boolean(r.completedAt))).length;
  await prisma.haccpRun.update({
    where: { id: runId },
    data: { itemsCompleted: completedCount },
  });

  if (status === "needs_attention") {
    await recordAudit(teamId, "temp_failed", `${item.label} was out of range.`, input.actorName, {
      runId,
      itemId,
    });
  }

  return { ok: true as const, item: serializeRunItem(updated), needsCorrectiveAction: status === "needs_attention" };
}

export async function createHaccpCorrectiveAction(
  teamId: string,
  input: {
    runId?: string | null;
    runItemId?: string | null;
    coolingLogId?: string | null;
    actionType: HaccpCorrectiveActionType;
    notes?: string | null;
    photoUrl?: string | null;
    performedByUserId?: string | null;
    performedByName: string;
  },
) {
  const row = await prisma.haccpCorrectiveAction.create({
    data: {
      teamId,
      runId: input.runId ?? null,
      runItemId: input.runItemId ?? null,
      coolingLogId: input.coolingLogId ?? null,
      actionType: input.actionType,
      notes: input.notes?.trim().slice(0, 500) || null,
      photoUrl: input.photoUrl ?? null,
      performedByUserId: input.performedByUserId ?? null,
      performedByName: input.performedByName.trim().slice(0, 120) || "Associate",
      status: "open",
    },
  });

  await recordAudit(teamId, "corrective_opened", `Corrective action opened (${input.actionType}).`, input.performedByName, {
    actionId: row.id,
  });

  return {
    ok: true as const,
    action: {
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export async function resolveHaccpCorrectiveAction(teamId: string, actionId: string, actorName: string) {
  const row = await prisma.haccpCorrectiveAction.updateMany({
    where: { id: actionId, teamId, status: "open" },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  if (row.count === 0) return { ok: false as const, code: "NOT_FOUND" as const };
  await recordAudit(teamId, "corrective_resolved", "Corrective action resolved.", actorName, { actionId });
  return { ok: true as const };
}

export async function completeHaccpRun(teamId: string, runId: string, actorName: string) {
  const run = await prisma.haccpRun.findFirst({
    where: { id: runId, teamId, status: "in_progress" },
    include: { items: true },
  });
  if (!run) return { ok: false as const, code: "NOT_FOUND" as const };
  const incomplete = run.items.filter((i) => !i.completedAt);
  if (incomplete.length > 0) return { ok: false as const, code: "VALIDATION" as const };

  const updated = await prisma.haccpRun.update({
    where: { id: runId },
    data: { status: "completed", completedAt: new Date(), itemsCompleted: run.itemsTotal },
  });
  await recordAudit(teamId, "run_completed", `${run.templateName} completed.`, actorName, { runId });
  return { ok: true as const, run: serializeRun(updated) };
}

export async function listHaccpCoolingLogs(teamId: string) {
  const rows = await prisma.haccpCoolingLog.findMany({
    where: { teamId, status: { in: ["active", "overdue", "failed"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const now = Date.now();
  return rows.map((row) => {
    const overdue = row.status === "active" && row.nextReadingDueAt.getTime() < now;
    return {
      id: row.id,
      itemName: row.itemName,
      status: overdue ? ("overdue" as const) : (row.status as HaccpCoolingStatus),
      startTime: row.startTime.toISOString(),
      firstTempF: row.firstTempF,
      nextReadingDueAt: row.nextReadingDueAt.toISOString(),
      msUntilNext: Math.max(0, row.nextReadingDueAt.getTime() - now),
      readings: row.readings,
      createdByName: row.createdByName,
    };
  });
}

export async function createHaccpCoolingLog(
  teamId: string,
  input: {
    itemName: string;
    firstTempF: number;
    createdByName: string;
    deviceId?: string | null;
  },
) {
  const nextDue = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const row = await prisma.haccpCoolingLog.create({
    data: {
      teamId,
      itemName: input.itemName.trim().slice(0, 200),
      firstTempF: input.firstTempF,
      nextReadingDueAt: nextDue,
      createdByName: input.createdByName.trim().slice(0, 120) || "Associate",
      deviceId: input.deviceId ?? null,
      readings: [{ tempF: input.firstTempF, recordedAt: new Date().toISOString() }],
    },
  });
  await recordAudit(teamId, "cooling_started", `Cooling log started for ${row.itemName}.`, input.createdByName);
  return {
    ok: true as const,
    log: {
      id: row.id,
      itemName: row.itemName,
      status: row.status,
      nextReadingDueAt: row.nextReadingDueAt.toISOString(),
    },
  };
}

export async function addHaccpCoolingReading(
  teamId: string,
  logId: string,
  input: { tempF: number; actorName: string },
) {
  const log = await prisma.haccpCoolingLog.findFirst({ where: { id: logId, teamId } });
  if (!log) return { ok: false as const, code: "NOT_FOUND" as const };

  const readings = Array.isArray(log.readings) ? [...(log.readings as object[])] : [];
  readings.push({ tempF: input.tempF, recordedAt: new Date().toISOString() });

  const passed = input.tempF <= 41;
  const status: HaccpCoolingStatus = passed ? "passed" : "failed";
  const row = await prisma.haccpCoolingLog.update({
    where: { id: logId },
    data: {
      readings,
      status,
      nextReadingDueAt: passed ? log.nextReadingDueAt : new Date(),
      updatedAt: new Date(),
    },
  });

  if (!passed) {
    await recordAudit(teamId, "cooling_failed", `${log.itemName} cooling check failed.`, input.actorName, { logId });
  } else {
    await recordAudit(teamId, "cooling_passed", `${log.itemName} cooling completed.`, input.actorName, { logId });
  }

  return { ok: true as const, log: { id: row.id, status: row.status, passed }, needsCorrectiveAction: !passed };
}

export async function createHaccpProbeCalibration(
  teamId: string,
  input: {
    actualTempF: number;
    performedByName: string;
    performedByUserId?: string | null;
    deviceId?: string | null;
  },
) {
  const targetTempF = 32;
  const passed = Math.abs(input.actualTempF - targetTempF) <= 2;
  const nextDueAt = new Date();
  nextDueAt.setDate(nextDueAt.getDate() + 30);
  const row = await prisma.haccpProbeCalibration.create({
    data: {
      teamId,
      targetTempF,
      actualTempF: input.actualTempF,
      passed,
      performedByName: input.performedByName.trim().slice(0, 120) || "Associate",
      performedByUserId: input.performedByUserId ?? null,
      deviceId: input.deviceId ?? null,
      nextDueAt,
    },
  });
  await recordAudit(
    teamId,
    passed ? "calibration_passed" : "calibration_failed",
    `Probe calibration ${passed ? "passed" : "failed"} (${input.actualTempF}°F).`,
    input.performedByName,
  );
  return {
    ok: true as const,
    calibration: {
      id: row.id,
      targetTempF: row.targetTempF,
      actualTempF: row.actualTempF,
      passed: row.passed,
      nextDueAt: row.nextDueAt.toISOString(),
    },
  };
}

export async function getHaccpManagerDashboard(teamId: string) {
  const dayStart = startOfDay();
  const dayEnd = endOfDay();
  const [failedItems, openActions, manualCount, runs, locations] = await Promise.all([
    prisma.haccpRunItem.count({
      where: {
        status: "needs_attention",
        completedAt: { gte: dayStart, lte: dayEnd },
        run: { teamId },
      },
    }),
    prisma.haccpCorrectiveAction.findMany({
      where: { teamId, status: "open" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.haccpRunItem.count({
      where: {
        entryMethod: "manual",
        completedAt: { gte: dayStart, lte: dayEnd },
        run: { teamId },
      },
    }),
    prisma.haccpRun.findMany({
      where: { teamId, startedAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.haccpTemplate.findMany({ where: { teamId, isActive: true }, select: { workplace: true } }),
  ]);

  const bluetoothCount = await prisma.haccpRunItem.count({
    where: {
      entryMethod: "bluetooth",
      completedAt: { gte: dayStart, lte: dayEnd },
      run: { teamId },
    },
  });

  const missed = runs.filter((r) => r.status === "missed").length;
  const workplaceSet = new Set(locations.map((l) => l.workplace));

  return {
    complianceByLocation: Array.from(workplaceSet).map((workplace) => ({
      workplace,
      completed: runs.filter((r) => r.status === "completed").length,
      missed,
      risk: missed > 0 ? "high" : failedItems > 0 ? "medium" : "low",
    })),
    missedWindows: missed,
    openCorrectiveActions: openActions.map((a) => ({
      id: a.id,
      actionType: a.actionType,
      performedByName: a.performedByName,
      createdAt: a.createdAt.toISOString(),
    })),
    failedTemps: failedItems,
    entryMix: { manual: manualCount, bluetooth: bluetoothCount },
    highestRiskLocations: Array.from(workplaceSet).slice(0, 5),
    trend: {
      last7Days: runs.length,
      completedToday: runs.filter((r) => r.status === "completed").length,
    },
  };
}

async function assertPublicGoHaccpDevice(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };
  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };
  return { ok: true as const, teamId: team.id };
}

export async function getPublicFoodSafetyDashboard(hubToken: string, deviceId: string) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  const dashboard = await getFoodSafetyDashboard(ctx.teamId);
  return { ok: true as const, dashboard };
}

export async function startPublicHaccpRun(
  hubToken: string,
  deviceId: string,
  templateId: string,
  actorName: string,
  leaderUserId?: string | null,
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return startHaccpRun(ctx.teamId, templateId, {
    userId: leaderUserId ?? `go-device:${deviceId.slice(0, 96)}`,
    name: actorName,
    deviceId,
  });
}

export async function getPublicHaccpRun(hubToken: string, deviceId: string, runId: string) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return getHaccpRun(ctx.teamId, runId);
}

export async function completePublicHaccpRunItem(
  hubToken: string,
  deviceId: string,
  runId: string,
  itemId: string,
  input: Parameters<typeof completeHaccpRunItem>[3],
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return completeHaccpRunItem(ctx.teamId, runId, itemId, input);
}

export async function completePublicHaccpRun(
  hubToken: string,
  deviceId: string,
  runId: string,
  actorName: string,
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return completeHaccpRun(ctx.teamId, runId, actorName);
}

export async function createPublicHaccpCorrectiveAction(
  hubToken: string,
  deviceId: string,
  input: Parameters<typeof createHaccpCorrectiveAction>[1],
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return createHaccpCorrectiveAction(ctx.teamId, input);
}

export async function listPublicHaccpCoolingLogs(hubToken: string, deviceId: string) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  const logs = await listHaccpCoolingLogs(ctx.teamId);
  return { ok: true as const, logs };
}

export async function createPublicHaccpCoolingLog(
  hubToken: string,
  deviceId: string,
  input: { itemName: string; firstTempF: number; createdByName: string },
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return createHaccpCoolingLog(ctx.teamId, { ...input, deviceId });
}

export async function addPublicHaccpCoolingReading(
  hubToken: string,
  deviceId: string,
  logId: string,
  input: { tempF: number; actorName: string },
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return addHaccpCoolingReading(ctx.teamId, logId, input);
}

export async function createPublicHaccpProbeCalibration(
  hubToken: string,
  deviceId: string,
  input: { actualTempF: number; performedByName: string; performedByUserId?: string | null },
) {
  const ctx = await assertPublicGoHaccpDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;
  return createHaccpProbeCalibration(ctx.teamId, { ...input, deviceId });
}
