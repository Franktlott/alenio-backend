import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { serializeWalkTemplate } from "./serialize";
import { templateInclude } from "./walk-template-service";

function asSnapshotItem(item: {
  id: string;
  sectionId: string | null;
  type: string;
  title: string;
  description: string | null;
  instructions: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown>;
  libraryItemId?: string | null;
  libraryItemVersionId?: string | null;
  libraryItemVersion?: number | null;
  correctiveActions?: unknown[];
}) {
  return {
    id: item.id,
    sectionId: item.sectionId,
    type: item.type,
    title: item.title,
    description: item.description,
    instructions: item.instructions,
    position: item.position,
    required: item.required,
    config: item.config,
    libraryItemId: item.libraryItemId ?? null,
    libraryItemVersionId: item.libraryItemVersionId ?? null,
    libraryItemVersion: item.libraryItemVersion ?? null,
    correctiveActions: item.correctiveActions ?? [],
  };
}

export async function publishWalkTemplate(teamId: string, templateId: string, userId: string) {
  const row = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId },
    include: templateInclude,
  });
  if (!row) return { error: "NOT_FOUND" as const };
  if (row.status === "ARCHIVED") {
    return { error: "ARCHIVED" as const, message: "Archived walks cannot be published" };
  }

  const serialized = serializeWalkTemplate(row, { includeItemsLoose: true });
  type AnyItem = Parameters<typeof asSnapshotItem>[0];
  const flat: AnyItem[] = [];
  for (const section of serialized.sections) {
    for (const item of section.items) {
      flat.push(item as AnyItem);
    }
  }
  for (const item of serialized.unsectionedItems ?? []) {
    flat.push(item as AnyItem);
  }
  if (flat.length === 0) {
    return { error: "EMPTY_WALK" as const, message: "Add at least one item before publishing" };
  }

  const nextVersion = row.status === "PUBLISHED" ? row.version + 1 : Math.max(1, row.version);

  const snapshot = {
    id: serialized.id,
    name: serialized.name,
    description: serialized.description,
    workplace: serialized.workplace,
    scoringEnabled: serialized.scoringEnabled,
    version: nextVersion,
    sections: serialized.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      position: s.position,
      items: s.items.map((i) => asSnapshotItem(i as AnyItem)),
    })),
    unsectionedItems: (serialized.unsectionedItems ?? []).map((i) => asSnapshotItem(i as AnyItem)),
  };

  const result = await prisma.$transaction(async (tx) => {
    const versionRow = await tx.walkTemplateVersion.create({
      data: {
        templateId,
        version: nextVersion,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        publishedByUserId: userId,
      },
    });
    const template = await tx.walkTemplate.update({
      where: { id: templateId },
      data: {
        status: "PUBLISHED",
        isActive: true,
        version: nextVersion,
        publishedAt: new Date(),
        publishedByUserId: userId,
      },
      include: templateInclude,
    });
    return { template, versionRow };
  });

  return {
    ok: true as const,
    template: serializeWalkTemplate(result.template, { includeItemsLoose: true }),
    publishedVersion: {
      id: result.versionRow.id,
      version: result.versionRow.version,
      publishedAt: result.versionRow.publishedAt.toISOString(),
    },
  };
}

export async function createDraftFromPublished(teamId: string, templateId: string, userId: string) {
  const source = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId, status: "PUBLISHED" },
    include: templateInclude,
  });
  if (!source) return { error: "NOT_FOUND" as const };

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.walkTemplate.create({
      data: {
        teamId,
        name: `${source.name} (Draft)`,
        description: source.description,
        workplace: source.workplace,
        scoringEnabled: source.scoringEnabled,
        estimatedDurationMinutes: source.estimatedDurationMinutes,
        status: "DRAFT",
        version: 1,
        isActive: true,
        parentTemplateId: source.id,
        createdByUserId: userId,
      },
    });

    const sectionIdMap = new Map<string, string>();
    for (const section of source.sections) {
      const s = await tx.walkTemplateSection.create({
        data: {
          templateId: created.id,
          title: section.title,
          description: section.description,
          sortOrder: section.sortOrder,
        },
      });
      sectionIdMap.set(section.id, s.id);
    }

    for (const placement of source.placements) {
      await tx.walkTemplatePlacement.create({
        data: {
          templateId: created.id,
          sectionId: placement.sectionId ? sectionIdMap.get(placement.sectionId) ?? null : null,
          libraryItemId: placement.libraryItemId,
          libraryItemVersionId: placement.libraryItemVersionId,
          sortOrder: placement.sortOrder,
          requiredOverride: placement.requiredOverride,
          instructionsOverride: placement.instructionsOverride,
          titleOverride: placement.titleOverride,
        },
      });
    }

    return tx.walkTemplate.findFirst({
      where: { id: created.id },
      include: templateInclude,
    });
  });

  if (!draft) return { error: "NOT_FOUND" as const };
  return { ok: true as const, template: serializeWalkTemplate(draft, { includeItemsLoose: true }) };
}

export async function archiveWalkTemplate(teamId: string, templateId: string) {
  const row = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!row) return { error: "NOT_FOUND" as const };
  const updated = await prisma.walkTemplate.update({
    where: { id: templateId },
    data: { status: "ARCHIVED", isActive: false },
    include: templateInclude,
  });
  return { ok: true as const, template: serializeWalkTemplate(updated, { includeItemsLoose: true }) };
}

export async function getLatestPublishedSnapshot(teamId: string, templateId: string) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return null;
  return prisma.walkTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { version: "desc" },
  });
}
