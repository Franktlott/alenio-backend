import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_OPERATIONAL_CONTEXT,
  DEFAULT_STUDIO_DATA,
  SENECA_PROMPT_TEMPLATE_KEYS,
  type SenecaConfigStatus,
  type SenecaConfigType,
  type SenecaOperationalContextData,
  type SenecaOwnerType,
  type SenecaStudioData,
} from "./seneca-config-types";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export type SenecaOwnerRef = {
  ownerType: SenecaOwnerType;
  ownerId: string;
};

/** Future Organization inheritance plugs in here without changing Studio UI. */
export function workspaceOwner(teamId: string): SenecaOwnerRef {
  return { ownerType: "WORKSPACE", ownerId: teamId };
}

export async function getLatestConfig(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  type: SenecaConfigType,
  status?: SenecaConfigStatus,
) {
  return prisma.senecaConfig.findFirst({
    where: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type,
      ...(status ? { status } : {}),
    },
    orderBy: [{ version: "desc" }],
  });
}

export async function getPublishedOrDraftStudio(prisma: PrismaClient, owner: SenecaOwnerRef) {
  const published = await getLatestConfig(prisma, owner, "STUDIO", "PUBLISHED");
  if (published) {
    return {
      row: published,
      data: parseJson(published.data, DEFAULT_STUDIO_DATA),
      source: "published" as const,
    };
  }
  const draft = await getLatestConfig(prisma, owner, "STUDIO", "DRAFT");
  if (draft) {
    return {
      row: draft,
      data: parseJson(draft.data, DEFAULT_STUDIO_DATA),
      source: "draft" as const,
    };
  }
  return {
    row: null,
    data: { ...DEFAULT_STUDIO_DATA },
    source: "default" as const,
  };
}

export async function getPublishedOrDraftOperational(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
) {
  const published = await getLatestConfig(prisma, owner, "OPERATIONAL_CONTEXT", "PUBLISHED");
  if (published) {
    return {
      row: published,
      data: parseJson(published.data, DEFAULT_OPERATIONAL_CONTEXT),
      source: "published" as const,
    };
  }
  const draft = await getLatestConfig(prisma, owner, "OPERATIONAL_CONTEXT", "DRAFT");
  if (draft) {
    return {
      row: draft,
      data: parseJson(draft.data, DEFAULT_OPERATIONAL_CONTEXT),
      source: "draft" as const,
    };
  }
  return {
    row: null,
    data: { ...DEFAULT_OPERATIONAL_CONTEXT },
    source: "default" as const,
  };
}

export async function saveStudioDraft(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  data: SenecaStudioData,
  userId: string,
) {
  const existing = await getLatestConfig(prisma, owner, "STUDIO", "DRAFT");
  const payload = JSON.stringify(data);
  if (existing) {
    return prisma.senecaConfig.update({
      where: { id: existing.id },
      data: { data: payload, updatedAt: new Date() },
    });
  }
  const latestAny = await getLatestConfig(prisma, owner, "STUDIO");
  const version = (latestAny?.version ?? 0) + 1;
  return prisma.senecaConfig.create({
    data: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type: "STUDIO",
      status: "DRAFT",
      version,
      data: payload,
      createdBy: userId,
    },
  });
}

export async function saveOperationalDraft(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  data: SenecaOperationalContextData,
  userId: string,
) {
  const existing = await getLatestConfig(prisma, owner, "OPERATIONAL_CONTEXT", "DRAFT");
  const payload = JSON.stringify(data);
  if (existing) {
    return prisma.senecaConfig.update({
      where: { id: existing.id },
      data: { data: payload, updatedAt: new Date() },
    });
  }
  const latestAny = await getLatestConfig(prisma, owner, "OPERATIONAL_CONTEXT");
  const version = (latestAny?.version ?? 0) + 1;
  return prisma.senecaConfig.create({
    data: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type: "OPERATIONAL_CONTEXT",
      status: "DRAFT",
      version,
      data: payload,
      createdBy: userId,
    },
  });
}

export async function publishConfig(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  type: Extract<SenecaConfigType, "STUDIO" | "OPERATIONAL_CONTEXT">,
  userId: string,
) {
  const draft = await getLatestConfig(prisma, owner, type, "DRAFT");
  if (!draft) {
    const published = await getLatestConfig(prisma, owner, type, "PUBLISHED");
    if (published) return published;
    throw new Error("Nothing to publish. Save a draft first.");
  }

  await prisma.senecaConfig.updateMany({
    where: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type,
      status: "PUBLISHED",
    },
    data: { status: "ARCHIVED" },
  });

  return prisma.senecaConfig.update({
    where: { id: draft.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedBy: userId,
    },
  });
}

export async function listConfigVersions(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  type: SenecaConfigType,
) {
  return prisma.senecaConfig.findMany({
    where: { ownerType: owner.ownerType, ownerId: owner.ownerId, type },
    orderBy: [{ version: "desc" }],
  });
}

export async function restoreConfigVersion(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  type: Extract<SenecaConfigType, "STUDIO" | "OPERATIONAL_CONTEXT">,
  version: number,
  userId: string,
) {
  const source = await prisma.senecaConfig.findFirst({
    where: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type,
      version,
    },
  });
  if (!source) throw new Error("Version not found.");
  const latest = await getLatestConfig(prisma, owner, type);
  const nextVersion = (latest?.version ?? 0) + 1;
  await prisma.senecaConfig.updateMany({
    where: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type,
      status: "DRAFT",
    },
    data: { status: "ARCHIVED" },
  });
  return prisma.senecaConfig.create({
    data: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      type,
      status: "DRAFT",
      version: nextVersion,
      data: source.data,
      createdBy: userId,
    },
  });
}

export async function ensurePromptTemplates(prisma: PrismaClient, owner: SenecaOwnerRef, userId?: string) {
  for (const tpl of SENECA_PROMPT_TEMPLATE_KEYS) {
    const existing = await prisma.senecaPromptTemplate.findUnique({
      where: {
        ownerType_ownerId_templateKey: {
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          templateKey: tpl.key,
        },
      },
    });
    if (!existing) {
      await prisma.senecaPromptTemplate.create({
        data: {
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          templateKey: tpl.key,
          title: tpl.title,
          instructions: "",
          createdBy: userId,
        },
      });
    }
  }
}

export async function listPromptTemplates(prisma: PrismaClient, owner: SenecaOwnerRef) {
  await ensurePromptTemplates(prisma, owner);
  return prisma.senecaPromptTemplate.findMany({
    where: { ownerType: owner.ownerType, ownerId: owner.ownerId },
    orderBy: { title: "asc" },
  });
}

export async function updatePromptTemplate(
  prisma: PrismaClient,
  owner: SenecaOwnerRef,
  templateKey: string,
  instructions: string,
  userId: string,
) {
  await ensurePromptTemplates(prisma, owner, userId);
  const row = await prisma.senecaPromptTemplate.findUnique({
    where: {
      ownerType_ownerId_templateKey: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        templateKey,
      },
    },
  });
  if (!row) throw new Error("Template not found.");
  const nextVersion = row.version + 1;
  await prisma.senecaPromptVersion.create({
    data: {
      templateId: row.id,
      version: row.version,
      instructions: row.instructions,
      createdBy: userId,
    },
  });
  return prisma.senecaPromptTemplate.update({
    where: { id: row.id },
    data: { instructions, version: nextVersion },
  });
}

export async function listActiveKnowledge(prisma: PrismaClient, owner: SenecaOwnerRef) {
  return prisma.senecaKnowledge.findMany({
    where: {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      status: "ACTIVE",
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function listAllKnowledge(prisma: PrismaClient, owner: SenecaOwnerRef) {
  return prisma.senecaKnowledge.findMany({
    where: { ownerType: owner.ownerType, ownerId: owner.ownerId },
    orderBy: [{ updatedAt: "desc" }],
  });
}
