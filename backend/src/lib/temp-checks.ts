import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";

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
  outOfWindowActions?: string[];
};

export type UpdateTempCheckTemplateInput = Partial<TempCheckTemplateInput> & { isActive?: boolean };

const templateInclude = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      correctiveActions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
  correctiveActions: {
    where: { itemId: null },
    orderBy: { sortOrder: "asc" as const },
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
      outOfWindowActions: parseActionLabels(input.outOfWindowActions),
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
  outOfWindowActions: string[];
};

async function persistTemplateChildren(
  tx: Prisma.TransactionClient,
  templateId: string,
  parsed: Pick<ParsedTemplate, "items" | "outOfWindowActions">,
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

  if (parsed.outOfWindowActions.length > 0) {
    await tx.tempCheckCorrectiveAction.createMany({
      data: parsed.outOfWindowActions.map((label, sortOrder) => ({
        templateId,
        itemId: null,
        label,
        sortOrder,
      })),
    });
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
  correctiveActions: { id: string; label: string; sortOrder: number }[];
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
    outOfWindowActions: template.correctiveActions.map((action) => ({
      id: action.id,
      label: action.label,
      sortOrder: action.sortOrder,
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
    outOfWindowActions:
      input.outOfWindowActions ?? existing.correctiveActions.map((a) => a.label),
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
      },
    });
    if (input.items || input.outOfWindowActions) {
      await persistTemplateChildren(tx, templateId, parsed);
    }
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

export function formatTempRange(tempMinF: number | null, tempMaxF: number | null): string {
  if (tempMinF != null && tempMaxF != null) return `${tempMinF}°F – ${tempMaxF}°F`;
  if (tempMinF != null) return `≥ ${tempMinF}°F`;
  if (tempMaxF != null) return `≤ ${tempMaxF}°F`;
  return "Any temperature";
}

export function formatTimeWindow(start: string, end: string): string {
  return `${start} – ${end}`;
}
