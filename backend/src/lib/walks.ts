import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { resolveVerifiedGoLeader } from "./go-leader-pin";
import { isGoDeviceApproved } from "./workplace-alerts";

export type WalkItemStatus = "pass" | "needs_attention" | "na";

export type WalkItemResponse = {
  itemId: string;
  label: string;
  status: WalkItemStatus;
  notes?: string | null;
  photoUrl?: string | null;
  /** Reserved for future follow-up task linking — not exposed in UI yet. */
  followUpTaskId?: string | null;
};

export type WalkSectionInput = {
  title: string;
  items: { label: string }[];
};

export type CreateWalkTemplateInput = {
  name: string;
  workplace: string;
  scoringEnabled?: boolean;
  items?: { label: string }[];
  sections?: WalkSectionInput[];
};

export type UpdateWalkTemplateInput = {
  name?: string;
  workplace?: string;
  scoringEnabled?: boolean;
  isActive?: boolean;
  items?: { label: string }[];
  sections?: WalkSectionInput[];
};

export type CompleteWalkInput = {
  responses: WalkItemResponse[];
  finalNotes?: string | null;
};

function isWalkManagerRole(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export function canManageWalks(role: string): boolean {
  return isWalkManagerRole(role);
}

async function assertTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
}

function parseItemLabels(raw: { label: string }[]): { label: string; sortOrder: number }[] {
  return raw
    .map((row, idx) => {
      const label = row.label.trim().slice(0, 280);
      if (!label) return null;
      return { label, sortOrder: idx };
    })
    .filter((x): x is { label: string; sortOrder: number } => x !== null);
}

type ParsedWalkSection = {
  title: string;
  sortOrder: number;
  items: { label: string; sortOrder: number }[];
};

function parseWalkSections(input: {
  items?: { label: string }[];
  sections?: WalkSectionInput[];
}): { ok: true; sections: ParsedWalkSection[] } | { ok: false } {
  const rawSections =
    input.sections && input.sections.length > 0
      ? input.sections
      : input.items && input.items.length > 0
        ? [{ title: "Observations", items: input.items }]
        : null;

  if (!rawSections) return { ok: false };

  const sections: ParsedWalkSection[] = [];
  let totalItems = 0;

  for (let sectionIndex = 0; sectionIndex < rawSections.length; sectionIndex += 1) {
    const title = rawSections[sectionIndex].title.trim().slice(0, 120);
    if (!title) return { ok: false };
    const items = parseItemLabels(rawSections[sectionIndex].items);
    if (items.length === 0) continue;
    totalItems += items.length;
    sections.push({ title, sortOrder: sectionIndex, items });
  }

  if (sections.length === 0 || totalItems === 0 || totalItems > 80 || sections.length > 20) {
    return { ok: false };
  }

  return { ok: true, sections };
}

const walkTemplateInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: { items: { orderBy: { sortOrder: "asc" as const } } },
  },
  items: { orderBy: { sortOrder: "asc" as const } },
} as const;

async function persistWalkSections(
  tx: Prisma.TransactionClient,
  templateId: string,
  sections: ParsedWalkSection[],
) {
  await tx.walkTemplateItem.deleteMany({ where: { templateId } });
  await tx.walkTemplateSection.deleteMany({ where: { templateId } });

  for (const section of sections) {
    const createdSection = await tx.walkTemplateSection.create({
      data: {
        templateId,
        title: section.title,
        sortOrder: section.sortOrder,
      },
    });
    await tx.walkTemplateItem.createMany({
      data: section.items.map((item) => ({
        templateId,
        sectionId: createdSection.id,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
    });
  }
}

function buildSerializedSections(template: {
  sections?: {
    id: string;
    title: string;
    sortOrder: number;
    items: { id: string; label: string; sortOrder: number }[];
  }[];
  items: { id: string; label: string; sortOrder: number; sectionId?: string | null }[];
}) {
  if (template.sections && template.sections.length > 0) {
    return template.sections.map((section) => ({
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        label: item.label,
        sortOrder: item.sortOrder,
        sectionId: section.id,
      })),
    }));
  }

  const legacyItems = template.items.filter((item) => !item.sectionId);
  if (legacyItems.length === 0) return [];

  return [
    {
      id: "legacy",
      title: "Observations",
      sortOrder: 0,
      items: legacyItems.map((item) => ({
        id: item.id,
        label: item.label,
        sortOrder: item.sortOrder,
        sectionId: null as string | null,
      })),
    },
  ];
}

function computeWalkStats(responses: WalkItemResponse[]) {
  let passCount = 0;
  let needsAttentionCount = 0;
  let naCount = 0;
  let photosCount = 0;

  for (const row of responses) {
    if (row.status === "pass") passCount += 1;
    else if (row.status === "needs_attention") needsAttentionCount += 1;
    else naCount += 1;
    if (row.photoUrl) photosCount += 1;
  }

  return {
    totalReviewed: responses.length,
    passCount,
    needsAttentionCount,
    naCount,
    photosCount,
  };
}

export function computeWalkScore(
  scoringEnabled: boolean,
  passCount: number,
  needsAttentionCount: number,
): number | null {
  if (!scoringEnabled) return null;
  const scored = passCount + needsAttentionCount;
  if (scored === 0) return null;
  return Math.round((passCount / scored) * 100);
}

function serializeTemplateRow(
  template: {
    id: string;
    teamId: string;
    name: string;
    workplace: string;
    scoringEnabled: boolean;
    isActive: boolean;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    sections?: {
      id: string;
      title: string;
      sortOrder: number;
      items: { id: string; label: string; sortOrder: number }[];
    }[];
    items: { id: string; label: string; sortOrder: number; sectionId?: string | null }[];
  },
  completionCount = 0,
) {
  const sections = buildSerializedSections(template);
  const flatItems = sections.flatMap((section) => section.items);

  return {
    id: template.id,
    teamId: template.teamId,
    name: template.name,
    workplace: template.workplace,
    scoringEnabled: template.scoringEnabled,
    isActive: template.isActive,
    createdByUserId: template.createdByUserId,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    itemCount: flatItems.length,
    completionCount,
    sectionCount: sections.length,
    sections,
    items: flatItems,
  };
}

function serializeCompletionRow(completion: {
  id: string;
  teamId: string;
  templateId: string;
  walkName: string;
  workplace: string;
  completedByUserId: string;
  completedByName: string;
  completedAt: Date;
  scoringEnabled: boolean;
  score: number | null;
  totalReviewed: number;
  passCount: number;
  needsAttentionCount: number;
  naCount: number;
  photosCount: number;
  finalNotes: string | null;
  responses: unknown;
}) {
  return {
    id: completion.id,
    teamId: completion.teamId,
    templateId: completion.templateId,
    walkName: completion.walkName,
    workplace: completion.workplace,
    completedByUserId: completion.completedByUserId,
    completedByName: completion.completedByName,
    completedAt: completion.completedAt.toISOString(),
    scoringEnabled: completion.scoringEnabled,
    score: completion.score,
    totalReviewed: completion.totalReviewed,
    passCount: completion.passCount,
    needsAttentionCount: completion.needsAttentionCount,
    naCount: completion.naCount,
    photosCount: completion.photosCount,
    finalNotes: completion.finalNotes,
    responses: completion.responses as WalkItemResponse[],
  };
}

function normalizeResponses(
  templateItems: { id: string; label: string }[],
  raw: WalkItemResponse[],
): { ok: true; responses: WalkItemResponse[] } | { ok: false; code: "VALIDATION" } {
  if (raw.length !== templateItems.length) return { ok: false, code: "VALIDATION" };

  const byId = new Map(templateItems.map((item) => [item.id, item]));
  const normalized: WalkItemResponse[] = [];

  for (const row of raw) {
    const item = byId.get(row.itemId);
    if (!item) return { ok: false, code: "VALIDATION" };
    if (row.status !== "pass" && row.status !== "needs_attention" && row.status !== "na") {
      return { ok: false, code: "VALIDATION" };
    }
    const notes = typeof row.notes === "string" ? row.notes.trim().slice(0, 500) || null : null;
    const photoUrl = typeof row.photoUrl === "string" ? row.photoUrl.trim().slice(0, 2048) || null : null;
    normalized.push({
      itemId: item.id,
      label: item.label,
      status: row.status,
      notes,
      photoUrl,
      followUpTaskId: null,
    });
  }

  return { ok: true, responses: normalized };
}

export async function listWalkTemplatesForUser(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const templates = await prisma.walkTemplate.findMany({
    where: { teamId, isActive: true },
    include: walkTemplateInclude,
    orderBy: { name: "asc" },
  });

  const counts = await prisma.walkCompletion.groupBy({
    by: ["templateId"],
    where: { teamId, templateId: { in: templates.map((t) => t.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.templateId, c._count._all]));

  return {
    ok: true as const,
    canManage: isWalkManagerRole(member.role),
    templates: templates.map((t) => serializeTemplateRow(t, countMap.get(t.id) ?? 0)),
  };
}

export async function getWalkTemplateForUser(teamId: string, templateId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: walkTemplateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };

  const completionCount = await prisma.walkCompletion.count({ where: { teamId, templateId } });

  return {
    ok: true as const,
    canManage: isWalkManagerRole(member.role),
    template: serializeTemplateRow(template, completionCount),
  };
}

export async function createWalkTemplate(teamId: string, userId: string, input: CreateWalkTemplateInput) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !isWalkManagerRole(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const name = input.name.trim().slice(0, 200);
  const workplace = input.workplace.trim().slice(0, 200);
  const parsed = parseWalkSections(input);
  if (!name || !workplace || !parsed.ok) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.walkTemplate.create({
      data: {
        teamId,
        name,
        workplace,
        scoringEnabled: input.scoringEnabled ?? true,
        createdByUserId: userId,
      },
    });
    await persistWalkSections(tx, created.id, parsed.sections);
    return tx.walkTemplate.findFirst({
      where: { id: created.id },
      include: walkTemplateInclude,
    });
  });

  if (!template) return { ok: false as const, code: "VALIDATION" as const };

  return { ok: true as const, template: serializeTemplateRow(template, 0) };
}

export async function updateWalkTemplate(
  teamId: string,
  templateId: string,
  userId: string,
  input: UpdateWalkTemplateInput,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !isWalkManagerRole(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const existing = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const data: {
    name?: string;
    workplace?: string;
    scoringEnabled?: boolean;
    isActive?: boolean;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 200);
    if (!name) return { ok: false as const, code: "VALIDATION" as const };
    data.name = name;
  }
  if (input.workplace !== undefined) {
    const workplace = input.workplace.trim().slice(0, 200);
    if (!workplace) return { ok: false as const, code: "VALIDATION" as const };
    data.workplace = workplace;
  }
  if (input.scoringEnabled !== undefined) data.scoringEnabled = input.scoringEnabled;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.walkTemplate.update({ where: { id: templateId }, data });
      if (input.items || input.sections) {
        const parsed = parseWalkSections({
          items: input.items,
          sections: input.sections,
        });
        if (!parsed.ok) throw new Error("VALIDATION");
        await persistWalkSections(tx, templateId, parsed.sections);
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "VALIDATION") {
      return { ok: false as const, code: "VALIDATION" as const };
    }
    throw err;
  }

  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId },
    include: walkTemplateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };

  const completionCount = await prisma.walkCompletion.count({ where: { teamId, templateId } });
  return { ok: true as const, template: serializeTemplateRow(template, completionCount) };
}

export async function deleteWalkTemplate(teamId: string, templateId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !isWalkManagerRole(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const existing = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  await prisma.walkTemplate.update({ where: { id: templateId }, data: { isActive: false } });
  return { ok: true as const };
}

export async function listWalkCompletionsForUser(teamId: string, userId: string, templateId?: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const completions = await prisma.walkCompletion.findMany({
    where: { teamId, ...(templateId ? { templateId } : {}) },
    orderBy: { completedAt: "desc" },
    take: 100,
  });

  return {
    ok: true as const,
    canManage: isWalkManagerRole(member.role),
    completions: completions.map(serializeCompletionRow),
  };
}

export async function getWalkCompletionForUser(teamId: string, completionId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const completion = await prisma.walkCompletion.findFirst({
    where: { id: completionId, teamId },
  });
  if (!completion) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    canManage: isWalkManagerRole(member.role),
    completion: serializeCompletionRow(completion),
  };
}

export async function completeWalk(
  teamId: string,
  templateId: string,
  userId: string,
  userName: string | null,
  input: CompleteWalkInput,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !isWalkManagerRole(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId, isActive: true },
    include: walkTemplateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };
  if (template.items.length === 0) return { ok: false as const, code: "VALIDATION" as const };

  const parsed = normalizeResponses(template.items, input.responses);
  if (!parsed.ok) return { ok: false as const, code: "VALIDATION" as const };

  const stats = computeWalkStats(parsed.responses);
  const score = computeWalkScore(template.scoringEnabled, stats.passCount, stats.needsAttentionCount);
  const finalNotes =
    typeof input.finalNotes === "string" ? input.finalNotes.trim().slice(0, 2000) || null : null;
  const completedByName = (userName ?? "Manager").trim().slice(0, 120) || "Manager";

  const completion = await prisma.walkCompletion.create({
    data: {
      teamId,
      templateId,
      walkName: template.name,
      workplace: template.workplace,
      completedByUserId: userId,
      completedByName,
      scoringEnabled: template.scoringEnabled,
      score,
      totalReviewed: stats.totalReviewed,
      passCount: stats.passCount,
      needsAttentionCount: stats.needsAttentionCount,
      naCount: stats.naCount,
      photosCount: stats.photosCount,
      finalNotes,
      responses: parsed.responses,
    },
  });

  return { ok: true as const, completion: serializeCompletionRow(completion) };
}

function goDeviceActorId(deviceId: string): string {
  return `go-device:${deviceId.slice(0, 96)}`;
}

async function assertPublicGoWalkDevice(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };
  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false as const, code: "FORBIDDEN" as const };
  return { ok: true as const, teamId: team.id };
}

export async function listPublicWalkTemplates(hubToken: string, deviceId: string) {
  const ctx = await assertPublicGoWalkDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const templates = await prisma.walkTemplate.findMany({
    where: { teamId: ctx.teamId, isActive: true },
    include: walkTemplateInclude,
    orderBy: { name: "asc" },
  });

  const counts = await prisma.walkCompletion.groupBy({
    by: ["templateId"],
    where: { teamId: ctx.teamId, templateId: { in: templates.map((t) => t.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.templateId, c._count._all]));

  return {
    ok: true as const,
    templates: templates.map((t) => serializeTemplateRow(t, countMap.get(t.id) ?? 0)),
  };
}

export async function getPublicWalkTemplate(hubToken: string, deviceId: string, templateId: string) {
  const ctx = await assertPublicGoWalkDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId: ctx.teamId, isActive: true },
    include: walkTemplateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };

  const completionCount = await prisma.walkCompletion.count({
    where: { teamId: ctx.teamId, templateId },
  });

  return { ok: true as const, template: serializeTemplateRow(template, completionCount) };
}

export async function listPublicWalkCompletions(hubToken: string, deviceId: string) {
  const ctx = await assertPublicGoWalkDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const completions = await prisma.walkCompletion.findMany({
    where: { teamId: ctx.teamId },
    orderBy: { completedAt: "desc" },
    take: 100,
  });

  return { ok: true as const, completions: completions.map(serializeCompletionRow) };
}

export async function getPublicWalkCompletion(hubToken: string, deviceId: string, completionId: string) {
  const ctx = await assertPublicGoWalkDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  const completion = await prisma.walkCompletion.findFirst({
    where: { id: completionId, teamId: ctx.teamId },
  });
  if (!completion) return { ok: false as const, code: "NOT_FOUND" as const };

  return { ok: true as const, completion: serializeCompletionRow(completion) };
}

export async function completePublicWalk(
  hubToken: string,
  deviceId: string,
  templateId: string,
  actor: { managerName?: string | null; leaderUserId?: string | null },
  input: CompleteWalkInput,
) {
  const ctx = await assertPublicGoWalkDevice(hubToken, deviceId);
  if (!ctx.ok) return ctx;

  let completedByUserId: string;
  let completedByName: string;

  if (actor.leaderUserId?.trim()) {
    const leader = await resolveVerifiedGoLeader(prisma, ctx.teamId, actor.leaderUserId.trim());
    if (!leader.ok) return { ok: false as const, code: "VALIDATION" as const };
    completedByUserId = leader.leader.userId;
    completedByName = leader.leader.name;
  } else {
    const name = (actor.managerName ?? "").trim();
    if (!name) return { ok: false as const, code: "VALIDATION" as const };
    completedByUserId = goDeviceActorId(deviceId);
    completedByName = name.slice(0, 120);
  }

  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId: ctx.teamId, isActive: true },
    include: walkTemplateInclude,
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };
  if (template.items.length === 0) return { ok: false as const, code: "VALIDATION" as const };

  const parsed = normalizeResponses(template.items, input.responses);
  if (!parsed.ok) return { ok: false as const, code: "VALIDATION" as const };

  const stats = computeWalkStats(parsed.responses);
  const score = computeWalkScore(template.scoringEnabled, stats.passCount, stats.needsAttentionCount);
  const finalNotes =
    typeof input.finalNotes === "string" ? input.finalNotes.trim().slice(0, 2000) || null : null;

  const completion = await prisma.walkCompletion.create({
    data: {
      teamId: ctx.teamId,
      templateId,
      walkName: template.name,
      workplace: template.workplace,
      completedByUserId,
      completedByName,
      scoringEnabled: template.scoringEnabled,
      score,
      totalReviewed: stats.totalReviewed,
      passCount: stats.passCount,
      needsAttentionCount: stats.needsAttentionCount,
      naCount: stats.naCount,
      photosCount: stats.photosCount,
      finalNotes,
      responses: parsed.responses,
    },
  });

  return { ok: true as const, completion: serializeCompletionRow(completion) };
}
