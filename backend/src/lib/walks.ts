import { prisma } from "../prisma";

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

export type CreateWalkTemplateInput = {
  name: string;
  workplace: string;
  scoringEnabled?: boolean;
  items: { label: string }[];
};

export type UpdateWalkTemplateInput = {
  name?: string;
  workplace?: string;
  scoringEnabled?: boolean;
  isActive?: boolean;
  items?: { label: string }[];
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
    items: { id: string; label: string; sortOrder: number }[];
  },
  completionCount = 0,
) {
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
    itemCount: template.items.length,
    completionCount,
    items: template.items.map((item) => ({
      id: item.id,
      label: item.label,
      sortOrder: item.sortOrder,
    })),
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
    include: { items: { orderBy: { sortOrder: "asc" } } },
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
    include: { items: { orderBy: { sortOrder: "asc" } } },
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
  const items = parseItemLabels(input.items);
  if (!name || !workplace || items.length === 0) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const template = await prisma.walkTemplate.create({
    data: {
      teamId,
      name,
      workplace,
      scoringEnabled: input.scoringEnabled ?? true,
      createdByUserId: userId,
      items: { create: items },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

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
      if (input.items) {
        const items = parseItemLabels(input.items);
        if (items.length === 0) throw new Error("VALIDATION");
        await tx.walkTemplateItem.deleteMany({ where: { templateId } });
        await tx.walkTemplateItem.createMany({
          data: items.map((item) => ({ templateId, label: item.label, sortOrder: item.sortOrder })),
        });
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
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) return { ok: false as const, code: "NOT_FOUND" as const };

  const completionCount = await prisma.walkCompletion.count({ where: { teamId, templateId } });
  return { ok: true as const, template: serializeTemplateRow(template, completionCount) };
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
    include: { items: { orderBy: { sortOrder: "asc" } } },
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
