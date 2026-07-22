import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getWalkItemTypeDefinition, parseItemConfig } from "../walks/item-types/registry";
import { serializeLibraryItem } from "../walks/serialize";
import {
  isWalkItemType,
  WALK_LIBRARY_CATEGORIES,
  type WalkItemType,
  type WalkLibraryStatus,
} from "../walks/types";

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
    return { allowManualEntry: true, allowBluetoothProbe: true };
  }
  if (type === "PHOTO" || type === "VISUAL_CHECK") {
    return { allowPhotoCapture: true };
  }
  return { allowManualEntry: true };
}

export async function listOrgLibraryItems(
  organizationId: string,
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
      organizationId,
      teamId: null,
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

export async function getOrgLibraryItem(organizationId: string, itemId: string) {
  const row = await prisma.walkLibraryItem.findFirst({
    where: { id: itemId, organizationId, teamId: null },
    include: itemInclude,
  });
  if (!row) return null;
  return serializeLibraryItem(row);
}

export async function createOrgLibraryItem(input: {
  organizationId: string;
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
      organizationId: input.organizationId,
      teamId: null,
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

export async function updateOrgLibraryItem(
  organizationId: string,
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
    where: { id: itemId, organizationId, teamId: null },
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
      },
      include: itemInclude,
    });
  });

  return { ok: true as const, item: serializeLibraryItem(row) };
}
