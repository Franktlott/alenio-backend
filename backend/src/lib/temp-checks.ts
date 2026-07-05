import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { resolveVerifiedGoLeader } from "./go-leader-pin";
import { resolveTimeZone } from "./timezone";
import { isGoDeviceApproved } from "./workplace-alerts";

export type TempCheckItemInput = {
  label: string;
  tempMinF?: number | null;
  tempMaxF?: number | null;
  correctiveActions?: string[];
};

export type TempCheckTemplateInput = {
  name: string;
  description?: string | null;
  dueTimeLocal: string;
  windowStartLocal: string;
  windowEndLocal: string;
  items: TempCheckItemInput[];
};

export type UpdateTempCheckTemplateInput = Partial<TempCheckTemplateInput> & {
  isActive?: boolean;
  isPublished?: boolean;
};

const templateInclude = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      correctiveActions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
} as const;

function isManagerRole(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export function canManageTempChecks(role: string): boolean {
  return isManagerRole(role);
}

async function assertTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseLocalTime(value: string): string | null {
  const trimmed = value.trim();
  if (!TIME_RE.test(trimmed)) return null;
  return trimmed;
}

function parseTemp(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function parseActionLabels(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const label = row.trim().slice(0, 200);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= 12) break;
  }
  return out;
}

function parseItems(raw: TempCheckItemInput[]): { ok: true; items: ParsedItem[] } | { ok: false } {
  if (!raw.length || raw.length > 40) return { ok: false };
  const items: ParsedItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const label = raw[i]!.label.trim().slice(0, 200);
    if (!label) return { ok: false };
    const tempMinF = parseTemp(raw[i]!.tempMinF);
    const tempMaxF = parseTemp(raw[i]!.tempMaxF);
    if (tempMinF != null && tempMaxF != null && tempMinF > tempMaxF) return { ok: false };
    items.push({
      label,
      tempMinF,
      tempMaxF,
      sortOrder: i,
      correctiveActions: parseActionLabels(raw[i]!.correctiveActions),
    });
  }
  return { ok: true, items };
}

type ParsedItem = {
  label: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  sortOrder: number;
  correctiveActions: string[];
};

function parseTemplateInput(input: TempCheckTemplateInput): { ok: true; parsed: ParsedTemplate } | { ok: false } {
  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false };
  const dueTimeLocal = parseLocalTime(input.dueTimeLocal);
  const windowStartLocal = parseLocalTime(input.windowStartLocal);
  const windowEndLocal = parseLocalTime(input.windowEndLocal);
  if (!dueTimeLocal || !windowStartLocal || !windowEndLocal) return { ok: false };
  const itemsParsed = parseItems(input.items);
  if (!itemsParsed.ok) return { ok: false };
  return {
    ok: true,
    parsed: {
      name,
      description: input.description?.trim().slice(0, 2000) || null,
      dueTimeLocal,
      windowStartLocal,
      windowEndLocal,
      items: itemsParsed.items,
    },
  };
}

type ParsedTemplate = {
  name: string;
  description: string | null;
  dueTimeLocal: string;
  windowStartLocal: string;
  windowEndLocal: string;
  items: ParsedItem[];
};

async function persistTemplateChildren(
  tx: Prisma.TransactionClient,
  templateId: string,
  parsed: Pick<ParsedTemplate, "items">,
) {
  await tx.tempCheckCorrectiveAction.deleteMany({ where: { templateId } });
  await tx.tempCheckTemplateItem.deleteMany({ where: { templateId } });

  for (const item of parsed.items) {
    const createdItem = await tx.tempCheckTemplateItem.create({
      data: {
        templateId,
        label: item.label,
        tempMinF: item.tempMinF,
        tempMaxF: item.tempMaxF,
        sortOrder: item.sortOrder,
      },
    });
    if (item.correctiveActions.length > 0) {
      await tx.tempCheckCorrectiveAction.createMany({
        data: item.correctiveActions.map((label, sortOrder) => ({
          templateId,
          itemId: createdItem.id,
          label,
          sortOrder,
        })),
      });
    }
  }
}

function serializeTemplate(template: {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  dueTimeLocal: string;
  windowStartLocal: string;
  windowEndLocal: string;
  isActive: boolean;
  isPublished: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    label: string;
    tempMinF: number | null;
    tempMaxF: number | null;
    sortOrder: number;
    correctiveActions: { id: string; label: string; sortOrder: number }[];
  }[];
}) {
  return {
    id: template.id,
    teamId: template.teamId,
    name: template.name,
    description: template.description,
    dueTimeLocal: template.dueTimeLocal,
    windowStartLocal: template.windowStartLocal,
    windowEndLocal: template.windowEndLocal,
    isActive: template.isActive,
    isPublished: "isPublished" in template ? template.isPublished : true,
    createdByUserId: template.createdByUserId,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    itemCount: template.items.length,
    items: template.items.map((item) => ({
      id: item.id,
      label: item.label,
      tempMinF: item.tempMinF,
      tempMaxF: item.tempMaxF,
      sortOrder: item.sortOrder,
      correctiveActions: item.correctiveActions.map((action) => ({
        id: action.id,
        label: action.label,
        sortOrder: action.sortOrder,
      })),
    })),
  };
}

export async function listTempCheckTemplatesForUser(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  const templates = await prisma.tempCheckTemplate.findMany({
    where: { teamId, isActive: true },
    orderBy: [{ dueTimeLocal: "asc" }, { name: "asc" }],
    include: templateInclude,
  });
  return {
    ok: true as const,
    canManage: canManageTempChecks(member.role),
    templates: templates.map(serializeTemplate),
  };
}

export async function getTempCheckTemplateForUser(teamId: string, templateId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  const template = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: templateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };
  return {
    ok: true as const,
    canManage: canManageTempChecks(member.role),
    template: serializeTemplate(template),
  };
}

export async function createTempCheckTemplate(teamId: string, userId: string, input: TempCheckTemplateInput) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };
  const parsedResult = parseTemplateInput(input);
  if (!parsedResult.ok) return { ok: false as const, code: "VALIDATION" as const };
  const { parsed } = parsedResult;

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.tempCheckTemplate.create({
      data: {
        teamId,
        name: parsed.name,
        description: parsed.description,
        dueTimeLocal: parsed.dueTimeLocal,
        windowStartLocal: parsed.windowStartLocal,
        windowEndLocal: parsed.windowEndLocal,
        createdByUserId: userId,
        isPublished: false,
      },
    });
    await persistTemplateChildren(tx, created.id, parsed);
    return tx.tempCheckTemplate.findUniqueOrThrow({
      where: { id: created.id },
      include: templateInclude,
    });
  });

  return { ok: true as const, template: serializeTemplate(template) };
}

export async function updateTempCheckTemplate(
  teamId: string,
  templateId: string,
  userId: string,
  input: UpdateTempCheckTemplateInput,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };

  const existing = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: templateInclude,
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const metadataOnly =
    input.isPublished !== undefined &&
    input.isActive === undefined &&
    input.name === undefined &&
    input.description === undefined &&
    input.dueTimeLocal === undefined &&
    input.windowStartLocal === undefined &&
    input.windowEndLocal === undefined &&
    input.items === undefined;

  if (metadataOnly) {
    const template = await prisma.tempCheckTemplate.update({
      where: { id: templateId },
      data: {
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: templateInclude,
    });
    return { ok: true as const, template: serializeTemplate(template) };
  }

  const merged: TempCheckTemplateInput = {
    name: input.name ?? existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    dueTimeLocal: input.dueTimeLocal ?? existing.dueTimeLocal,
    windowStartLocal: input.windowStartLocal ?? existing.windowStartLocal,
    windowEndLocal: input.windowEndLocal ?? existing.windowEndLocal,
    items:
      input.items ??
      existing.items.map((item) => ({
        label: item.label,
        tempMinF: item.tempMinF,
        tempMaxF: item.tempMaxF,
        correctiveActions: item.correctiveActions.map((a) => a.label),
      })),
  };

  const parsedResult = parseTemplateInput(merged);
  if (!parsedResult.ok) return { ok: false as const, code: "VALIDATION" as const };
  const { parsed } = parsedResult;

  const template = await prisma.$transaction(async (tx) => {
    await tx.tempCheckTemplate.update({
      where: { id: templateId },
      data: {
        name: parsed.name,
        description: parsed.description,
        dueTimeLocal: parsed.dueTimeLocal,
        windowStartLocal: parsed.windowStartLocal,
        windowEndLocal: parsed.windowEndLocal,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
    });
    if (input.items) {
      await persistTemplateChildren(tx, templateId, parsed);
    }
    await tx.tempCheckCorrectiveAction.deleteMany({ where: { templateId, itemId: null } });
    return tx.tempCheckTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: templateInclude,
    });
  });

  return { ok: true as const, template: serializeTemplate(template) };
}

export async function deleteTempCheckTemplate(teamId: string, templateId: string, userId: string) {
  return updateTempCheckTemplate(teamId, templateId, userId, { isActive: false });
}

export async function publishTempCheckTemplate(teamId: string, templateId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };

  const existing = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: templateInclude,
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const template = await prisma.tempCheckTemplate.update({
    where: { id: templateId },
    data: { isPublished: true },
    include: templateInclude,
  });
  return { ok: true as const, template: serializeTemplate(template) };
}

export async function unpublishTempCheckTemplate(teamId: string, templateId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };

  const existing = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: templateInclude,
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const template = await prisma.tempCheckTemplate.update({
    where: { id: templateId },
    data: { isPublished: false },
    include: templateInclude,
  });
  return { ok: true as const, template: serializeTemplate(template) };
}

export function formatTempRange(tempMinF: number | null, tempMaxF: number | null): string {
  if (tempMinF != null && tempMaxF != null) return `${tempMinF}°F – ${tempMaxF}°F`;
  if (tempMinF != null) return `≥ ${tempMinF}°F`;
  if (tempMaxF != null) return `≤ ${tempMaxF}°F`;
  return "Any temperature";
}

export function formatTimeWindow(start: string, end: string): string {
  return `${start} – ${end}`;
}

function localTimeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

/** Checks whether a temp check can be started/submitted at the given instant. */
export function isWithinCheckScheduleWindow(
  at: Date,
  windowStartLocal: string,
  windowEndLocal: string,
  timeZone?: string,
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMinutes = hour * 60 + minute;
  const start = localTimeToMinutes(windowStartLocal);
  const end = localTimeToMinutes(windowEndLocal);
  if (start <= end) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end;
}

export function isReadingInTempRange(readingF: number, tempMinF: number | null, tempMaxF: number | null): boolean {
  if (tempMinF != null && readingF < tempMinF) return false;
  if (tempMaxF != null && readingF > tempMaxF) return false;
  return true;
}

export type TempCheckReadingInput = {
  itemId: string;
  readingF: number;
  correctiveAction?: string | null;
  notes?: string | null;
};

export type TempCheckReadingRow = {
  itemId: string;
  label: string;
  readingF: number;
  inRange: boolean;
  tempMinF: number | null;
  tempMaxF: number | null;
  correctiveAction: string | null;
  notes: string | null;
};

export type CompleteTempCheckInput = {
  readings: TempCheckReadingInput[];
  timeZone?: string | null;
};

function serializePublicTemplateRow(
  template: {
    id: string;
    teamId: string;
    name: string;
    description: string | null;
    dueTimeLocal: string;
    windowStartLocal: string;
    windowEndLocal: string;
    isActive: boolean;
    isPublished: boolean;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    items: {
      id: string;
      label: string;
      tempMinF: number | null;
      tempMaxF: number | null;
      sortOrder: number;
      correctiveActions: { id: string; label: string; sortOrder: number }[];
    }[];
  },
  completionCount: number,
  timeZone?: string | null,
) {
  const serialized = serializeTemplate(template);
  const tz = resolveTimeZone(timeZone);
  return {
    ...serialized,
    completionCount,
    windowOpen: isWithinCheckScheduleWindow(new Date(), template.windowStartLocal, template.windowEndLocal, tz),
  };
}

function serializeCompletionRow(completion: {
  id: string;
  teamId: string;
  templateId: string;
  checkName: string;
  dueTimeLocal: string;
  windowStartLocal: string;
  windowEndLocal: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: Date;
  deviceId: string | null;
  totalItems: number;
  inRangeCount: number;
  outOfRangeCount: number;
  readings: unknown;
}) {
  return {
    id: completion.id,
    teamId: completion.teamId,
    templateId: completion.templateId,
    checkName: completion.checkName,
    dueTimeLocal: completion.dueTimeLocal,
    windowStartLocal: completion.windowStartLocal,
    windowEndLocal: completion.windowEndLocal,
    completedByUserId: completion.completedByUserId,
    completedByName: completion.completedByName,
    completedAt: completion.completedAt.toISOString(),
    deviceId: completion.deviceId,
    totalItems: completion.totalItems,
    inRangeCount: completion.inRangeCount,
    outOfRangeCount: completion.outOfRangeCount,
    readings: completion.readings as TempCheckReadingRow[],
  };
}

function parseReading(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (rounded < -80 || rounded > 500) return null;
  return rounded;
}

function normalizeReadings(
  templateItems: {
    id: string;
    label: string;
    tempMinF: number | null;
    tempMaxF: number | null;
    correctiveActions: { label: string }[];
  }[],
  raw: TempCheckReadingInput[],
): { ok: true; readings: TempCheckReadingRow[] } | { ok: false; code: "VALIDATION" } {
  if (raw.length !== templateItems.length) return { ok: false, code: "VALIDATION" };
  const byId = new Map(raw.map((row) => [row.itemId, row]));
  const readings: TempCheckReadingRow[] = [];

  for (const item of templateItems) {
    const row = byId.get(item.id);
    if (!row) return { ok: false, code: "VALIDATION" };
    const readingF = parseReading(row.readingF);
    if (readingF == null) return { ok: false, code: "VALIDATION" };
    const inRange = isReadingInTempRange(readingF, item.tempMinF, item.tempMaxF);
    const correctiveAction =
      typeof row.correctiveAction === "string" ? row.correctiveAction.trim().slice(0, 200) || null : null;
    const notes = typeof row.notes === "string" ? row.notes.trim().slice(0, 500) || null : null;
    if (!inRange) {
      if (!correctiveAction) return { ok: false, code: "VALIDATION" };
      const allowed = item.correctiveActions.map((a) => a.label.toLowerCase());
      if (allowed.length > 0 && !allowed.includes(correctiveAction.toLowerCase())) {
        return { ok: false, code: "VALIDATION" };
      }
    } else if (correctiveAction) {
      return { ok: false, code: "VALIDATION" };
    }
    readings.push({
      itemId: item.id,
      label: item.label,
      readingF,
      inRange,
      tempMinF: item.tempMinF,
      tempMaxF: item.tempMaxF,
      correctiveAction,
      notes,
    });
  }

  return { ok: true, readings };
}

async function assertPublicGoTempCheckDevice(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };
  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };
  return { ok: true as const, teamId: team.id };
}

export async function listPublicTempCheckTemplates(hubToken: string, deviceId: string, timeZone?: string | null) {
  const ctx = await assertPublicGoTempCheckDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const templates = await prisma.tempCheckTemplate.findMany({
    where: { teamId: ctx.teamId, isActive: true, isPublished: true },
    include: templateInclude,
    orderBy: [{ dueTimeLocal: "asc" }, { name: "asc" }],
  });

  let countMap = new Map<string, number>();
  try {
    const counts = await prisma.tempCheckCompletion.groupBy({
      by: ["templateId"],
      where: { teamId: ctx.teamId, templateId: { in: templates.map((t) => t.id) } },
      _count: { _all: true },
    });
    countMap = new Map(counts.map((c) => [c.templateId, c._count._all]));
  } catch {
    countMap = new Map();
  }

  return {
    ok: true as const,
    templates: templates.map((t) => serializePublicTemplateRow(t, countMap.get(t.id) ?? 0, timeZone)),
  };
}

export async function getPublicTempCheckTemplate(
  hubToken: string,
  deviceId: string,
  templateId: string,
  timeZone?: string | null,
) {
  const ctx = await assertPublicGoTempCheckDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const template = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId: ctx.teamId, isActive: true, isPublished: true },
    include: templateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };

  let completionCount = 0;
  try {
    completionCount = await prisma.tempCheckCompletion.count({
      where: { teamId: ctx.teamId, templateId },
    });
  } catch {
    completionCount = 0;
  }

  return { ok: true as const, template: serializePublicTemplateRow(template, completionCount, timeZone) };
}

export async function listPublicTempCheckCompletions(hubToken: string, deviceId: string) {
  const ctx = await assertPublicGoTempCheckDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const completions = await prisma.tempCheckCompletion.findMany({
    where: { teamId: ctx.teamId },
    orderBy: { completedAt: "desc" },
    take: 100,
  });

  return { ok: true as const, completions: completions.map(serializeCompletionRow) };
}

export async function getPublicTempCheckCompletion(hubToken: string, deviceId: string, completionId: string) {
  const ctx = await assertPublicGoTempCheckDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const completion = await prisma.tempCheckCompletion.findFirst({
    where: { id: completionId, teamId: ctx.teamId },
  });
  if (!completion) return { ok: false as const, code: "NOT_FOUND" as const };

  return { ok: true as const, completion: serializeCompletionRow(completion) };
}

export async function completePublicTempCheck(
  hubToken: string,
  deviceId: string,
  templateId: string,
  actor: { leaderUserId?: string | null },
  input: CompleteTempCheckInput,
) {
  const ctx = await assertPublicGoTempCheckDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  if (!actor.leaderUserId?.trim()) return { ok: false as const, code: "VALIDATION" as const };
  const leader = await resolveVerifiedGoLeader(prisma, ctx.teamId, actor.leaderUserId.trim());
  if (!leader.ok) return { ok: false as const, code: "VALIDATION" as const };

  const template = await prisma.tempCheckTemplate.findFirst({
    where: { id: templateId, teamId: ctx.teamId, isActive: true, isPublished: true },
    include: templateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };
  if (template.items.length === 0) return { ok: false as const, code: "VALIDATION" as const };

  if (!isWithinCheckScheduleWindow(
    new Date(),
    template.windowStartLocal,
    template.windowEndLocal,
    resolveTimeZone(input.timeZone),
  )) {
    return { ok: false as const, code: "OUTSIDE_WINDOW" as const };
  }

  const parsed = normalizeReadings(template.items, input.readings);
  if (!parsed.ok) return { ok: false as const, code: "VALIDATION" as const };

  const inRangeCount = parsed.readings.filter((r) => r.inRange).length;
  const outOfRangeCount = parsed.readings.length - inRangeCount;

  const completion = await prisma.tempCheckCompletion.create({
    data: {
      teamId: ctx.teamId,
      templateId,
      checkName: template.name,
      dueTimeLocal: template.dueTimeLocal,
      windowStartLocal: template.windowStartLocal,
      windowEndLocal: template.windowEndLocal,
      completedByUserId: leader.leader.userId,
      completedByName: leader.leader.name,
      deviceId: deviceId.slice(0, 128),
      totalItems: parsed.readings.length,
      inRangeCount,
      outOfRangeCount,
      readings: parsed.readings,
    },
  });

  return { ok: true as const, completion: serializeCompletionRow(completion) };
}
