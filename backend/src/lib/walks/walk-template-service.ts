import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getWalkItemTypeDefinition, parseItemConfig } from "./item-types/registry";
import { serializeWalkTemplate } from "./serialize";
import { isWalkItemType, type WalkItemType, type WalkTemplateStatus } from "./types";

const templateInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      items: {
        orderBy: { sortOrder: "asc" as const },
        include: { correctiveActions: { orderBy: { position: "asc" as const } } },
      },
    },
  },
  items: {
    where: { sectionId: null },
    orderBy: { sortOrder: "asc" as const },
    include: { correctiveActions: { orderBy: { position: "asc" as const } } },
  },
};

export async function listWalkTemplates(teamId: string) {
  const rows = await prisma.walkTemplate.findMany({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
    include: templateInclude,
  });
  return rows.map((row) => serializeWalkTemplate(row, { includeItemsLoose: true }));
}

export async function getWalkTemplate(teamId: string, templateId: string) {
  const row = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId },
    include: templateInclude,
  });
  if (!row) return null;
  return serializeWalkTemplate(row, { includeItemsLoose: true });
}

export async function createWalkTemplate(input: {
  teamId: string;
  userId: string;
  name: string;
  description?: string | null;
  workplace?: string;
  estimatedDurationMinutes?: number | null;
}) {
  const row = await prisma.walkTemplate.create({
    data: {
      teamId: input.teamId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      workplace: input.workplace?.trim() || "",
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      status: "DRAFT",
      version: 1,
      isActive: true,
      createdByUserId: input.userId,
      sections: {
        create: {
          title: "General",
          sortOrder: 0,
        },
      },
    },
    include: templateInclude,
  });
  return serializeWalkTemplate(row, { includeItemsLoose: true });
}

export async function updateWalkTemplate(
  teamId: string,
  templateId: string,
  patch: {
    name?: string;
    description?: string | null;
    workplace?: string;
    scoringEnabled?: boolean;
    estimatedDurationMinutes?: number | null;
    status?: WalkTemplateStatus;
  },
) {
  const existing = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!existing) return null;
  if (existing.status === "PUBLISHED" && patch.status !== "ARCHIVED") {
    // Phase 1: allow metadata edits on published for now; Phase 5 will force draft-from-published.
  }

  const row = await prisma.walkTemplate.update({
    where: { id: templateId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.workplace !== undefined ? { workplace: patch.workplace.trim() } : {}),
      ...(patch.scoringEnabled !== undefined ? { scoringEnabled: patch.scoringEnabled } : {}),
      ...(patch.estimatedDurationMinutes !== undefined
        ? { estimatedDurationMinutes: patch.estimatedDurationMinutes }
        : {}),
      ...(patch.status !== undefined
        ? {
            status: patch.status,
            isActive: patch.status !== "ARCHIVED",
            ...(patch.status === "PUBLISHED" ? { publishedAt: existing.publishedAt ?? new Date() } : {}),
          }
        : {}),
    },
    include: templateInclude,
  });
  return serializeWalkTemplate(row, { includeItemsLoose: true });
}

export async function deleteWalkTemplate(teamId: string, templateId: string) {
  const existing = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!existing) return false;
  await prisma.walkTemplate.delete({ where: { id: templateId } });
  return true;
}

export async function createWalkSection(
  teamId: string,
  templateId: string,
  input: { title: string; description?: string | null },
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return null;
  const max = await prisma.walkTemplateSection.aggregate({
    where: { templateId },
    _max: { sortOrder: true },
  });
  const section = await prisma.walkTemplateSection.create({
    data: {
      templateId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { correctiveActions: true } },
    },
  });
  return section;
}

export async function updateWalkSection(
  teamId: string,
  templateId: string,
  sectionId: string,
  patch: { title?: string; description?: string | null },
) {
  const section = await prisma.walkTemplateSection.findFirst({
    where: { id: sectionId, templateId, template: { teamId } },
  });
  if (!section) return null;
  return prisma.walkTemplateSection.update({
    where: { id: sectionId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
    },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { correctiveActions: true } },
    },
  });
}

export async function deleteWalkSection(teamId: string, templateId: string, sectionId: string) {
  const section = await prisma.walkTemplateSection.findFirst({
    where: { id: sectionId, templateId, template: { teamId } },
  });
  if (!section) return false;
  await prisma.walkTemplateItem.updateMany({
    where: { sectionId },
    data: { sectionId: null },
  });
  await prisma.walkTemplateSection.delete({ where: { id: sectionId } });
  return true;
}

export async function reorderWalkSections(
  teamId: string,
  templateId: string,
  orderedIds: string[],
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return null;
  const sections = await prisma.walkTemplateSection.findMany({ where: { templateId } });
  if (sections.length !== orderedIds.length) {
    throw new Error("REORDER_MISMATCH");
  }
  const idSet = new Set(sections.map((s) => s.id));
  for (const id of orderedIds) {
    if (!idSet.has(id)) throw new Error("REORDER_UNKNOWN_ID");
  }
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.walkTemplateSection.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return getWalkTemplate(teamId, templateId);
}

export async function createWalkItem(
  teamId: string,
  templateId: string,
  input: {
    type: string;
    title: string;
    sectionId?: string | null;
    description?: string | null;
    instructions?: string | null;
    required?: boolean;
    failureBehavior?: string | null;
    config?: unknown;
  },
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return { error: "NOT_FOUND" as const };

  if (!isWalkItemType(input.type)) {
    return { error: "INVALID_TYPE" as const, message: "Unknown walk item type" };
  }
  const type = input.type as WalkItemType;
  const def = getWalkItemTypeDefinition(type)!;

  if (input.sectionId) {
    const section = await prisma.walkTemplateSection.findFirst({
      where: { id: input.sectionId, templateId },
    });
    if (!section) return { error: "INVALID_SECTION" as const, message: "Section not found" };
  }

  const configResult = parseItemConfig(type, input.config ?? def.defaultConfig);
  if (!configResult.ok) return { error: "INVALID_CONFIG" as const, message: configResult.message };

  const max = await prisma.walkTemplateItem.aggregate({
    where: { templateId, sectionId: input.sectionId ?? null },
    _max: { sortOrder: true },
  });

  const item = await prisma.walkTemplateItem.create({
    data: {
      templateId,
      sectionId: input.sectionId ?? null,
      type,
      label: input.title.trim(),
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      required: input.required ?? true,
      failureBehavior: input.failureBehavior ?? null,
      config: configResult.value as Prisma.InputJsonValue,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
    include: { correctiveActions: true },
  });
  return { ok: true as const, item };
}

export async function updateWalkItem(
  teamId: string,
  templateId: string,
  itemId: string,
  patch: {
    title?: string;
    description?: string | null;
    instructions?: string | null;
    required?: boolean;
    failureBehavior?: string | null;
    sectionId?: string | null;
    config?: unknown;
    type?: string;
  },
) {
  const item = await prisma.walkTemplateItem.findFirst({
    where: { id: itemId, templateId, template: { teamId } },
  });
  if (!item) return { error: "NOT_FOUND" as const };

  let nextType = item.type as WalkItemType;
  if (patch.type !== undefined) {
    if (!isWalkItemType(patch.type)) {
      return { error: "INVALID_TYPE" as const, message: "Unknown walk item type" };
    }
    nextType = patch.type;
  }

  let nextConfig: Prisma.InputJsonValue | undefined;
  if (patch.config !== undefined || patch.type !== undefined) {
    const configResult = parseItemConfig(nextType, patch.config ?? item.config);
    if (!configResult.ok) return { error: "INVALID_CONFIG" as const, message: configResult.message };
    nextConfig = configResult.value as Prisma.InputJsonValue;
  }

  if (patch.sectionId) {
    const section = await prisma.walkTemplateSection.findFirst({
      where: { id: patch.sectionId, templateId },
    });
    if (!section) return { error: "INVALID_SECTION" as const, message: "Section not found" };
  }

  const updated = await prisma.walkTemplateItem.update({
    where: { id: itemId },
    data: {
      ...(patch.title !== undefined ? { label: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.instructions !== undefined ? { instructions: patch.instructions?.trim() || null } : {}),
      ...(patch.required !== undefined ? { required: patch.required } : {}),
      ...(patch.failureBehavior !== undefined ? { failureBehavior: patch.failureBehavior } : {}),
      ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
      ...(patch.type !== undefined ? { type: nextType } : {}),
      ...(nextConfig !== undefined ? { config: nextConfig } : {}),
    },
    include: { correctiveActions: true },
  });
  return { ok: true as const, item: updated };
}

export async function deleteWalkItem(teamId: string, templateId: string, itemId: string) {
  const item = await prisma.walkTemplateItem.findFirst({
    where: { id: itemId, templateId, template: { teamId } },
  });
  if (!item) return false;
  await prisma.walkTemplateItem.delete({ where: { id: itemId } });
  return true;
}

export async function reorderWalkItems(
  teamId: string,
  templateId: string,
  orderedIds: string[],
  sectionId?: string | null,
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return null;

  const items = await prisma.walkTemplateItem.findMany({
    where: {
      templateId,
      ...(sectionId === undefined ? {} : { sectionId: sectionId }),
    },
  });

  if (sectionId !== undefined) {
    if (items.length !== orderedIds.length) throw new Error("REORDER_MISMATCH");
    const idSet = new Set(items.map((i) => i.id));
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new Error("REORDER_UNKNOWN_ID");
    }
  } else {
    const all = await prisma.walkTemplateItem.findMany({ where: { templateId } });
    const idSet = new Set(all.map((i) => i.id));
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new Error("REORDER_UNKNOWN_ID");
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.walkTemplateItem.update({
        where: { id },
        data: {
          sortOrder: index,
          ...(sectionId !== undefined ? { sectionId } : {}),
        },
      }),
    ),
  );
  return getWalkTemplate(teamId, templateId);
}
