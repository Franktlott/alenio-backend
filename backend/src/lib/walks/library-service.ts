import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getWalkItemTypeDefinition, parseItemConfig } from "./item-types/registry";
import { serializeLibraryItem } from "./serialize";
import {
  isWalkItemType,
  WALK_LIBRARY_CATEGORIES,
  type WalkItemType,
  type WalkLibraryStatus,
} from "./types";

const versionInclude = {
  correctiveActions: { orderBy: { position: "asc" as const } },
};

const itemInclude = {
  versions: {
    orderBy: { version: "desc" as const },
    include: versionInclude,
  },
};

function defaultDeviceMethods(type: WalkItemType): Record<string, unknown> {
  if (type === "TEMPERATURE") {
    return { allowManualEntry: true, allowBluetoothProbe: false };
  }
  if (type === "PHOTO" || type === "VISUAL_CHECK") {
    return { allowPhotoCapture: true };
  }
  return { allowManualEntry: true };
}

export async function listLibraryItems(
  teamId: string,
  filters?: {
    q?: string;
    type?: string;
    category?: string;
    status?: WalkLibraryStatus | "ALL";
  },
) {
  const status = filters?.status === "ALL" ? undefined : (filters?.status ?? "ACTIVE");
  const rows = await prisma.walkLibraryItem.findMany({
    where: {
      teamId,
      ...(status ? { status } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.q?.trim()
        ? {
            OR: [
              { name: { contains: filters.q.trim(), mode: "insensitive" } },
              { description: { contains: filters.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    include: itemInclude,
  });
  return rows.map((row) => serializeLibraryItem(row));
}

export async function getLibraryItem(teamId: string, itemId: string) {
  const row = await prisma.walkLibraryItem.findFirst({
    where: { id: itemId, teamId },
    include: itemInclude,
  });
  if (!row) return null;
  return serializeLibraryItem(row);
}

export async function createLibraryItem(input: {
  teamId: string;
  userId: string;
  name: string;
  description?: string | null;
  category?: string;
  type: string;
  instructions?: string | null;
  requiredDefault?: boolean;
  config?: unknown;
  deviceMethods?: unknown;
}) {
  if (!isWalkItemType(input.type)) {
    return { error: "INVALID_TYPE" as const, message: "Unknown walk item type" };
  }
  const type = input.type as WalkItemType;
  const def = getWalkItemTypeDefinition(type)!;
  const configResult = parseItemConfig(type, input.config ?? def.defaultConfig);
  if (!configResult.ok) return { error: "INVALID_CONFIG" as const, message: configResult.message };

  const category =
    input.category && (WALK_LIBRARY_CATEGORIES as readonly string[]).includes(input.category)
      ? input.category
      : input.category?.trim() || "Custom";

  const deviceMethods =
    input.deviceMethods && typeof input.deviceMethods === "object"
      ? (input.deviceMethods as Record<string, unknown>)
      : defaultDeviceMethods(type);

  const row = await prisma.walkLibraryItem.create({
    data: {
      teamId: input.teamId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category,
      type,
      status: "ACTIVE",
      currentVersion: 1,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      versions: {
        create: {
          version: 1,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          instructions: input.instructions?.trim() || null,
          requiredDefault: input.requiredDefault ?? true,
          config: configResult.value as Prisma.InputJsonValue,
          deviceMethods: deviceMethods as Prisma.InputJsonValue,
          createdByUserId: input.userId,
        },
      },
    },
    include: itemInclude,
  });

  return { ok: true as const, item: serializeLibraryItem(row) };
}

/** Edits create a new immutable version and bump currentVersion. */
export async function updateLibraryItem(
  teamId: string,
  itemId: string,
  userId: string,
  patch: {
    name?: string;
    description?: string | null;
    category?: string;
    instructions?: string | null;
    requiredDefault?: boolean;
    config?: unknown;
    deviceMethods?: unknown;
    status?: WalkLibraryStatus;
  },
) {
  const existing = await prisma.walkLibraryItem.findFirst({
    where: { id: itemId, teamId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: versionInclude } },
  });
  if (!existing) return { error: "NOT_FOUND" as const };

  if (patch.status === "ARCHIVED" || patch.status === "ACTIVE") {
    const row = await prisma.walkLibraryItem.update({
      where: { id: itemId },
      data: { status: patch.status, updatedByUserId: userId },
      include: itemInclude,
    });
    if (
      patch.name === undefined &&
      patch.description === undefined &&
      patch.category === undefined &&
      patch.instructions === undefined &&
      patch.requiredDefault === undefined &&
      patch.config === undefined &&
      patch.deviceMethods === undefined
    ) {
      return { ok: true as const, item: serializeLibraryItem(row) };
    }
  }

  const latest = existing.versions[0];
  if (!latest) return { error: "NOT_FOUND" as const };

  const type = existing.type as WalkItemType;
  if (!isWalkItemType(type)) return { error: "INVALID_TYPE" as const, message: "Corrupt item type" };

  const nextName = patch.name?.trim() || latest.name;
  const nextDescription =
    patch.description !== undefined ? patch.description?.trim() || null : latest.description;
  const nextInstructions =
    patch.instructions !== undefined ? patch.instructions?.trim() || null : latest.instructions;
  const nextRequired =
    patch.requiredDefault !== undefined ? patch.requiredDefault : latest.requiredDefault;
  const configResult = parseItemConfig(type, patch.config ?? latest.config);
  if (!configResult.ok) return { error: "INVALID_CONFIG" as const, message: configResult.message };
  const nextDevices =
    patch.deviceMethods && typeof patch.deviceMethods === "object"
      ? (patch.deviceMethods as Record<string, unknown>)
      : ((latest.deviceMethods as Record<string, unknown>) ?? defaultDeviceMethods(type));
  const nextCategory =
    patch.category !== undefined ? patch.category.trim() || "Custom" : existing.category;

  const nextVersion = existing.currentVersion + 1;

  const row = await prisma.$transaction(async (tx) => {
    await tx.walkLibraryItemVersion.create({
      data: {
        libraryItemId: itemId,
        version: nextVersion,
        name: nextName,
        description: nextDescription,
        instructions: nextInstructions,
        requiredDefault: nextRequired,
        config: configResult.value as Prisma.InputJsonValue,
        deviceMethods: nextDevices as Prisma.InputJsonValue,
        createdByUserId: userId,
        correctiveActions: {
          create: (latest.correctiveActions ?? []).map((a) => ({
            trigger: a.trigger,
            actionType: a.actionType,
            title: a.title,
            instructions: a.instructions,
            position: a.position,
            required: a.required,
            blocksCompletion: a.blocksCompletion,
            config: a.config === null ? undefined : (a.config as Prisma.InputJsonValue),
          })),
        },
      },
    });
    return tx.walkLibraryItem.update({
      where: { id: itemId },
      data: {
        name: nextName,
        description: nextDescription,
        category: nextCategory,
        currentVersion: nextVersion,
        updatedByUserId: userId,
        ...(patch.status ? { status: patch.status } : {}),
      },
      include: itemInclude,
    });
  });

  return { ok: true as const, item: serializeLibraryItem(row) };
}

export async function duplicateLibraryItem(teamId: string, itemId: string, userId: string) {
  const source = await getLibraryItem(teamId, itemId);
  if (!source?.current) return { error: "NOT_FOUND" as const };
  return createLibraryItem({
    teamId,
    userId,
    name: `${source.name} (Copy)`,
    description: source.description,
    category: source.category,
    type: source.type,
    instructions: source.current.instructions,
    requiredDefault: source.current.requiredDefault,
    config: source.current.config,
    deviceMethods: source.current.deviceMethods,
  });
}

export async function archiveLibraryItem(teamId: string, itemId: string, userId: string) {
  return updateLibraryItem(teamId, itemId, userId, { status: "ARCHIVED" });
}

export async function getLibraryItemUsage(teamId: string, itemId: string) {
  const item = await prisma.walkLibraryItem.findFirst({ where: { id: itemId, teamId } });
  if (!item) return null;
  const placements = await prisma.walkTemplatePlacement.findMany({
    where: { libraryItemId: itemId, template: { teamId } },
    include: {
      template: { select: { id: true, name: true, status: true, version: true } },
      libraryItemVersion: { select: { version: true } },
    },
  });
  const byTemplate = new Map<
    string,
    { templateId: string; name: string; status: string; version: number; pinnedVersions: number[] }
  >();
  for (const p of placements) {
    const cur = byTemplate.get(p.templateId) ?? {
      templateId: p.template.id,
      name: p.template.name,
      status: p.template.status,
      version: p.template.version,
      pinnedVersions: [],
    };
    cur.pinnedVersions.push(p.libraryItemVersion.version);
    byTemplate.set(p.templateId, cur);
  }
  return {
    libraryItemId: itemId,
    walks: [...byTemplate.values()].map((w) => ({
      ...w,
      pinnedVersions: [...new Set(w.pinnedVersions)].sort((a, b) => a - b),
    })),
  };
}

export async function listCorrectiveActions(teamId: string, libraryItemVersionId: string) {
  const ver = await prisma.walkLibraryItemVersion.findFirst({
    where: { id: libraryItemVersionId, libraryItem: { teamId } },
    include: versionInclude,
  });
  if (!ver) return null;
  return ver.correctiveActions;
}

export async function replaceCorrectiveActions(
  teamId: string,
  libraryItemId: string,
  userId: string,
  actions: Array<{
    trigger?: string;
    actionType: string;
    title: string;
    instructions?: string | null;
    required?: boolean;
    blocksCompletion?: boolean;
    config?: unknown;
  }>,
) {
  // Corrective actions are versioned with the item — create a new version carrying new CAs.
  const existing = await prisma.walkLibraryItem.findFirst({
    where: { id: libraryItemId, teamId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: versionInclude } },
  });
  if (!existing?.versions[0]) return { error: "NOT_FOUND" as const };
  const latest = existing.versions[0];
  const nextVersion = existing.currentVersion + 1;

  const row = await prisma.$transaction(async (tx) => {
    await tx.walkLibraryItemVersion.create({
      data: {
        libraryItemId,
        version: nextVersion,
        name: latest.name,
        description: latest.description,
        instructions: latest.instructions,
        requiredDefault: latest.requiredDefault,
        config: latest.config as Prisma.InputJsonValue,
        deviceMethods: latest.deviceMethods as Prisma.InputJsonValue,
        createdByUserId: userId,
        correctiveActions: {
          create: actions.map((a, index) => ({
            trigger: a.trigger ?? "ON_FAIL",
            actionType: a.actionType,
            title: a.title.trim(),
            instructions: a.instructions?.trim() || null,
            position: index,
            required: a.required ?? true,
            blocksCompletion: a.blocksCompletion ?? a.actionType === "BLOCK_COMPLETION",
            config:
              a.config && typeof a.config === "object"
                ? (a.config as Prisma.InputJsonValue)
                : undefined,
          })),
        },
      },
    });
    return tx.walkLibraryItem.update({
      where: { id: libraryItemId },
      data: { currentVersion: nextVersion, updatedByUserId: userId },
      include: itemInclude,
    });
  });

  return { ok: true as const, item: serializeLibraryItem(row) };
}

/** One-time backfill: embedded WalkTemplateItem → library + placement. */
export async function backfillLibraryFromTemplateItems(teamId?: string) {
  const items = await prisma.walkTemplateItem.findMany({
    where: {
      libraryItemId: null,
      ...(teamId ? { template: { teamId } } : {}),
    },
    include: { template: { select: { teamId: true, createdByUserId: true } } },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  for (const item of items) {
    const userId = item.template.createdByUserId;
    const lib = await createLibraryItem({
      teamId: item.template.teamId,
      userId,
      name: item.label,
      description: item.description,
      type: item.type,
      instructions: item.instructions,
      requiredDefault: item.required,
      config: item.config,
      category: "Custom",
    });
    if ("error" in lib) continue;

    const maxP = await prisma.walkTemplatePlacement.aggregate({
      where: { templateId: item.templateId, sectionId: item.sectionId },
      _max: { sortOrder: true },
    });

    await prisma.walkTemplatePlacement.create({
      data: {
        templateId: item.templateId,
        sectionId: item.sectionId,
        libraryItemId: lib.item.id,
        libraryItemVersionId: lib.item.current!.id,
        sortOrder: item.sortOrder ?? (maxP._max.sortOrder ?? -1) + 1,
        requiredOverride: item.required,
        instructionsOverride: item.instructions,
        titleOverride: null,
      },
    });
    await prisma.walkTemplateItem.update({
      where: { id: item.id },
      data: { libraryItemId: lib.item.id },
    });
    created += 1;
  }
  return { created, scanned: items.length };
}
