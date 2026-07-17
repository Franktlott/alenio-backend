import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getWalkItemTypeDefinition, parseItemConfig } from "./item-types/registry";
import { createLibraryItem, updateLibraryItem } from "./library-service";
import { serializePlacement, serializeWalkItem, serializeWalkTemplate } from "./serialize";
import { isWalkItemType, type WalkItemType, type WalkTemplateStatus } from "./types";

const placementInclude = {
  libraryItem: true,
  libraryItemVersion: {
    include: { correctiveActions: { orderBy: { position: "asc" as const } } },
  },
};

export const templateInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      items: { orderBy: { sortOrder: "asc" as const } },
      placements: {
        orderBy: { sortOrder: "asc" as const },
        include: placementInclude,
      },
    },
  },
  items: {
    where: { sectionId: null },
    orderBy: { sortOrder: "asc" as const },
  },
  placements: {
    where: { sectionId: null },
    orderBy: { sortOrder: "asc" as const },
    include: placementInclude,
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
      items: { orderBy: { sortOrder: "asc" } },
      placements: { orderBy: { sortOrder: "asc" }, include: placementInclude },
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
      items: { orderBy: { sortOrder: "asc" } },
      placements: { orderBy: { sortOrder: "asc" }, include: placementInclude },
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

/** Create a reusable library item and pin it on the walk (preferred path). */
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
    category?: string;
    userId: string;
  },
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return { error: "NOT_FOUND" as const };

  if (!isWalkItemType(input.type)) {
    return { error: "INVALID_TYPE" as const, message: "Unknown walk item type" };
  }
  if (input.sectionId) {
    const section = await prisma.walkTemplateSection.findFirst({
      where: { id: input.sectionId, templateId },
    });
    if (!section) return { error: "INVALID_SECTION" as const, message: "Section not found" };
  }

  const lib = await createLibraryItem({
    teamId,
    userId: input.userId,
    name: input.title,
    description: input.description,
    category: input.category ?? "Custom",
    type: input.type,
    instructions: input.instructions,
    requiredDefault: input.required ?? true,
    config: input.config,
  });
  if ("error" in lib) {
    return { error: lib.error, message: lib.message };
  }

  const maxP = await prisma.walkTemplatePlacement.aggregate({
    where: { templateId, sectionId: input.sectionId ?? null },
    _max: { sortOrder: true },
  });

  const placement = await prisma.walkTemplatePlacement.create({
    data: {
      templateId,
      sectionId: input.sectionId ?? null,
      libraryItemId: lib.item.id,
      libraryItemVersionId: lib.item.current!.id,
      sortOrder: (maxP._max.sortOrder ?? -1) + 1,
      requiredOverride: input.required ?? null,
      instructionsOverride: null,
      titleOverride: null,
    },
    include: placementInclude,
  });

  return { ok: true as const, item: serializePlacement(placement) };
}

export async function addLibraryItemToWalk(
  teamId: string,
  templateId: string,
  input: {
    libraryItemId: string;
    libraryItemVersionId?: string | null;
    sectionId?: string | null;
    requiredOverride?: boolean | null;
    instructionsOverride?: string | null;
    titleOverride?: string | null;
  },
) {
  const template = await prisma.walkTemplate.findFirst({ where: { id: templateId, teamId } });
  if (!template) return { error: "NOT_FOUND" as const };

  const lib = await prisma.walkLibraryItem.findFirst({
    where: { id: input.libraryItemId, teamId, status: "ACTIVE" },
    include: { versions: true },
  });
  if (!lib) return { error: "LIBRARY_NOT_FOUND" as const, message: "Library item not found" };

  const version =
    (input.libraryItemVersionId
      ? lib.versions.find((v) => v.id === input.libraryItemVersionId)
      : lib.versions.find((v) => v.version === lib.currentVersion)) ?? null;
  if (!version) return { error: "VERSION_NOT_FOUND" as const, message: "Library item version not found" };

  if (input.sectionId) {
    const section = await prisma.walkTemplateSection.findFirst({
      where: { id: input.sectionId, templateId },
    });
    if (!section) return { error: "INVALID_SECTION" as const, message: "Section not found" };
  }

  const maxP = await prisma.walkTemplatePlacement.aggregate({
    where: { templateId, sectionId: input.sectionId ?? null },
    _max: { sortOrder: true },
  });

  const placement = await prisma.walkTemplatePlacement.create({
    data: {
      templateId,
      sectionId: input.sectionId ?? null,
      libraryItemId: lib.id,
      libraryItemVersionId: version.id,
      sortOrder: (maxP._max.sortOrder ?? -1) + 1,
      requiredOverride: input.requiredOverride ?? null,
      instructionsOverride: input.instructionsOverride ?? null,
      titleOverride: input.titleOverride ?? null,
    },
    include: placementInclude,
  });

  return { ok: true as const, item: serializePlacement(placement) };
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
    libraryItemVersionId?: string;
    /** When true, retarget placement to the library item's current version. */
    pinToCurrentVersion?: boolean;
  },
  userId?: string,
) {
  const placement = await prisma.walkTemplatePlacement.findFirst({
    where: { id: itemId, templateId, template: { teamId } },
    include: placementInclude,
  });

  if (placement) {
    if (patch.sectionId) {
      const section = await prisma.walkTemplateSection.findFirst({
        where: { id: patch.sectionId, templateId },
      });
      if (!section) return { error: "INVALID_SECTION" as const, message: "Section not found" };
    }

    let nextVersionId = patch.libraryItemVersionId;

    if (patch.pinToCurrentVersion) {
      const lib = await prisma.walkLibraryItem.findFirst({
        where: { id: placement.libraryItemId, teamId },
        include: { versions: true },
      });
      if (!lib) return { error: "LIBRARY_NOT_FOUND" as const, message: "Library item not found" };
      const current = lib.versions.find((v) => v.version === lib.currentVersion);
      if (!current) return { error: "VERSION_NOT_FOUND" as const, message: "Current version missing" };
      nextVersionId = current.id;
    }

    const touchesLibraryContent =
      patch.title !== undefined ||
      patch.description !== undefined ||
      patch.instructions !== undefined ||
      patch.required !== undefined ||
      patch.config !== undefined;

    if (touchesLibraryContent && userId) {
      const libUpdate = await updateLibraryItem(teamId, placement.libraryItemId, userId, {
        name: patch.title,
        description: patch.description,
        instructions: patch.instructions,
        requiredDefault: patch.required,
        config: patch.config,
      });
      if ("error" in libUpdate) {
        return { error: libUpdate.error, message: libUpdate.message };
      }
      nextVersionId = libUpdate.item.current?.id ?? nextVersionId;
    } else if (touchesLibraryContent && !userId) {
      // Walk-local overrides only when no user context for library versioning.
      const updated = await prisma.walkTemplatePlacement.update({
        where: { id: itemId },
        data: {
          ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
          ...(patch.required !== undefined ? { requiredOverride: patch.required } : {}),
          ...(patch.instructions !== undefined
            ? { instructionsOverride: patch.instructions?.trim() || null }
            : {}),
          ...(patch.title !== undefined ? { titleOverride: patch.title.trim() || null } : {}),
        },
        include: placementInclude,
      });
      return { ok: true as const, item: serializePlacement(updated) };
    }

    if (nextVersionId) {
      const ver = await prisma.walkLibraryItemVersion.findFirst({
        where: {
          id: nextVersionId,
          libraryItemId: placement.libraryItemId,
          libraryItem: { teamId },
        },
      });
      if (!ver) return { error: "VERSION_NOT_FOUND" as const, message: "Version not found" };
    }

    const updated = await prisma.walkTemplatePlacement.update({
      where: { id: itemId },
      data: {
        ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
        ...(nextVersionId ? { libraryItemVersionId: nextVersionId } : {}),
        // Clear overrides when content was written into a new library version.
        ...(touchesLibraryContent && userId
          ? { titleOverride: null, instructionsOverride: null, requiredOverride: null }
          : {}),
      },
      include: placementInclude,
    });
    return { ok: true as const, item: serializePlacement(updated) };
  }

  // Legacy embedded item fallback
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
  });
  return { ok: true as const, item: serializeWalkItem(updated) };
}

export async function deleteWalkItem(teamId: string, templateId: string, itemId: string) {
  const placement = await prisma.walkTemplatePlacement.findFirst({
    where: { id: itemId, templateId, template: { teamId } },
  });
  if (placement) {
    await prisma.walkTemplatePlacement.delete({ where: { id: itemId } });
    return true;
  }
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

  const placements = await prisma.walkTemplatePlacement.findMany({
    where: {
      templateId,
      ...(sectionId === undefined ? {} : { sectionId }),
    },
  });

  if (placements.length > 0) {
    if (sectionId !== undefined && placements.length !== orderedIds.length) {
      throw new Error("REORDER_MISMATCH");
    }
    const idSet = new Set(placements.map((p) => p.id));
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new Error("REORDER_UNKNOWN_ID");
    }
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.walkTemplatePlacement.update({
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

  const items = await prisma.walkTemplateItem.findMany({
    where: {
      templateId,
      ...(sectionId === undefined ? {} : { sectionId }),
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

export async function listOutdatedPlacements(teamId: string, templateId: string) {
  const template = await getWalkTemplate(teamId, templateId);
  if (!template) return null;
  type OutdatedCandidate = {
    id: string;
    title: string;
    source?: string;
    libraryItemId?: string | null;
    libraryItemVersion?: number | null;
    libraryItemCurrentVersion?: number | null;
  };
  const items: OutdatedCandidate[] = [];
  for (const section of template.sections) {
    for (const item of section.items) {
      items.push(item as OutdatedCandidate);
    }
  }
  for (const item of template.unsectionedItems ?? []) {
    items.push(item as OutdatedCandidate);
  }
  return items
    .filter(
      (i) =>
        i.source === "placement" &&
        i.libraryItemVersion != null &&
        i.libraryItemCurrentVersion != null &&
        i.libraryItemCurrentVersion > i.libraryItemVersion,
    )
    .map((i) => ({
      placementId: i.id,
      libraryItemId: i.libraryItemId,
      title: i.title,
      pinnedVersion: i.libraryItemVersion,
      currentVersion: i.libraryItemCurrentVersion,
    }));
}
