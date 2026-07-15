import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { adminGuard } from "../middleware/admin-guard";
import { prisma } from "../prisma";
import { env } from "../env";
import {
  deleteDraftConfig,
  getPublishedOrDraftStudio,
  globalOwner,
  listAllKnowledge,
  listConfigVersions,
  listPromptTemplates,
  publishConfig,
  restoreConfigVersion,
  saveStudioDraft,
  updatePromptTemplate,
} from "../lib/seneca-config-service";
import { DEFAULT_STUDIO_DATA, type SenecaStudioData } from "../lib/seneca-config-types";
import { assembleSenecaSystemPrompt } from "../lib/seneca-prompt-assembly";
import { senecaAvailable, senecaText, senecaUnavailableMessage } from "../lib/seneca-openai";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const adminSenecaStudioRouter = new Hono<{ Variables: Variables }>();
adminSenecaStudioRouter.use("*", adminGuard);

const owner = globalOwner();

async function resolveUserNames(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(
    users.map((u) => [u.id, (u.name?.trim() || u.email?.trim() || "Unknown") as string]),
  );
}

function metaFromRow(
  row: {
    id: string;
    status: string;
    version: number;
    notes?: string | null;
    publishedAt: Date | null;
    publishedBy: string | null;
    updatedAt: Date;
  } | null,
  source: "published" | "draft" | "default",
  authorName: string | null = null,
) {
  return {
    id: row?.id ?? null,
    status: (row?.status as "DRAFT" | "PUBLISHED" | "ARCHIVED") ?? null,
    version: row?.version ?? null,
    source,
    notes: row?.notes ?? null,
    publishedAt: row?.publishedAt?.toISOString() ?? null,
    publishedBy: row?.publishedBy ?? null,
    publishedByName: authorName,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    canEdit: true,
  };
}

function versionRow(
  v: {
    id: string;
    status: string;
    version: number;
    notes?: string | null;
    publishedAt: Date | null;
    publishedBy: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  names: Map<string, string>,
) {
  const authorId = v.publishedBy || v.createdBy;
  return {
    id: v.id,
    status: v.status,
    version: v.version,
    notes: v.notes ?? null,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    publishedBy: v.publishedBy,
    createdBy: v.createdBy,
    authorName: authorId ? names.get(authorId) ?? null : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

const studioBodySchema = z.object({
  studio: z.object({
    tone: z.enum(["supportive", "balanced", "direct"]),
    responseLength: z.enum(["concise", "standard", "detailed"]),
    coachingStyle: z.enum([
      "development_first",
      "balanced",
      "accountability_first",
      "recognition_focused",
      "custom",
    ]),
    askFollowUps: z.boolean(),
    alwaysDo: z.array(z.string().trim().min(1).max(200)).max(40),
    neverDo: z.array(z.string().trim().min(1).max(200)).max(40),
    leadershipPhilosophy: z.string().max(12000),
    approvedTerms: z.array(z.string().trim().min(1).max(80)).max(80),
    avoidedTerms: z.array(z.string().trim().min(1).max(80)).max(80),
  }),
  notes: z.string().max(2000).optional().nullable(),
});

const notesOnlySchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

function serializeKnowledge(k: {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: string;
  version: number;
  contentText: string;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadedAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}) {
  return {
    id: k.id,
    title: k.title,
    category: k.category,
    description: k.description,
    status: k.status,
    version: k.version,
    contentText: k.contentText,
    fileUrl: k.fileUrl,
    fileName: k.fileName,
    mimeType: k.mimeType,
    uploadedAt: k.uploadedAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
    createdBy: k.createdBy,
  };
}

adminSenecaStudioRouter.get("/studio", async (c) => {
  const studio = await getPublishedOrDraftStudio(prisma, owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(studio.row, studio.source, authorId ? names.get(authorId) ?? null : null),
      studio: studio.data,
    },
  });
});

adminSenecaStudioRouter.put("/studio", zValidator("json", studioBodySchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");
  const data = { ...DEFAULT_STUDIO_DATA, ...body.studio } as SenecaStudioData;
  await saveStudioDraft(prisma, owner, data, user.id, body.notes);
  const studio = await getPublishedOrDraftStudio(prisma, owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(studio.row, studio.source, authorId ? names.get(authorId) ?? null : null),
      studio: studio.data,
    },
  });
});

adminSenecaStudioRouter.post("/studio/publish", zValidator("json", notesOnlySchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");
  try {
    await publishConfig(prisma, owner, "STUDIO", user.id, body.notes);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Could not publish." }, 400);
  }
  const studio = await getPublishedOrDraftStudio(prisma, owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(studio.row, studio.source, authorId ? names.get(authorId) ?? null : null),
      studio: studio.data,
    },
  });
});

adminSenecaStudioRouter.get("/studio/versions", async (c) => {
  const versions = await listConfigVersions(prisma, owner, "STUDIO");
  const names = await resolveUserNames(versions.flatMap((v) => [v.publishedBy, v.createdBy]));
  return c.json({ data: versions.map((v) => versionRow(v, names)) });
});

adminSenecaStudioRouter.post(
  "/studio/restore",
  zValidator("json", z.object({ version: z.number().int().positive() })),
  async (c) => {
    const user = c.get("user")!;
    const { version } = c.req.valid("json");
    try {
      await restoreConfigVersion(prisma, owner, "STUDIO", version, user.id);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Could not restore." }, 400);
    }
    const studio = await getPublishedOrDraftStudio(prisma, owner);
    const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
    const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
    return c.json({
      data: {
        ...metaFromRow(studio.row, studio.source, authorId ? names.get(authorId) ?? null : null),
        studio: studio.data,
      },
    });
  },
);

adminSenecaStudioRouter.delete(
  "/studio/versions/:version",
  async (c) => {
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: "Invalid version." }, 400);
    }
    try {
      await deleteDraftConfig(prisma, owner, "STUDIO", version);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Could not delete draft." }, 400);
    }
    return c.json({ data: { ok: true as const } });
  },
);

adminSenecaStudioRouter.get("/knowledge", async (c) => {
  const rows = await listAllKnowledge(prisma, owner);
  return c.json({ data: rows.map(serializeKnowledge) });
});

adminSenecaStudioRouter.post(
  "/knowledge",
  zValidator(
    "json",
    z.object({
      title: z.string().trim().min(1).max(200),
      category: z.string().trim().max(80).optional(),
      description: z.string().max(2000).optional(),
      contentText: z.string().max(100000).optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const row = await prisma.senecaKnowledge.create({
      data: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        title: body.title,
        category: body.category?.trim() || "general",
        description: body.description?.trim() || null,
        contentText: body.contentText ?? "",
        status: body.status ?? "ACTIVE",
        createdBy: user.id,
      },
    });
    return c.json({ data: serializeKnowledge(row) });
  },
);

adminSenecaStudioRouter.patch(
  "/knowledge/:id",
  zValidator(
    "json",
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      category: z.string().trim().max(80).optional(),
      description: z.string().max(2000).nullable().optional(),
      contentText: z.string().max(100000).optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id");
    const existing = await prisma.senecaKnowledge.findFirst({
      where: { id, ownerType: owner.ownerType, ownerId: owner.ownerId },
    });
    if (!existing) return c.json({ error: "Document not found." }, 404);
    const body = c.req.valid("json");
    await prisma.senecaKnowledgeVersion.create({
      data: {
        knowledgeId: existing.id,
        version: existing.version,
        title: existing.title,
        category: existing.category,
        description: existing.description,
        contentText: existing.contentText,
        fileUrl: existing.fileUrl,
        fileName: existing.fileName,
        createdBy: user.id,
      },
    });
    const row = await prisma.senecaKnowledge.update({
      where: { id: existing.id },
      data: {
        title: body.title ?? existing.title,
        category: body.category ?? existing.category,
        description: body.description === undefined ? existing.description : body.description,
        contentText: body.contentText ?? existing.contentText,
        status: body.status ?? existing.status,
        version: existing.version + 1,
      },
    });
    return c.json({ data: serializeKnowledge(row) });
  },
);

adminSenecaStudioRouter.delete("/knowledge/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.senecaKnowledge.findFirst({
    where: { id, ownerType: owner.ownerType, ownerId: owner.ownerId },
  });
  if (!existing) return c.json({ error: "Document not found." }, 404);
  await prisma.senecaKnowledge.delete({ where: { id } });
  return c.json({ data: { ok: true as const } });
});

adminSenecaStudioRouter.get("/prompt-templates", async (c) => {
  const rows = await listPromptTemplates(prisma, owner);
  return c.json({
    data: rows.map((t) => ({
      id: t.id,
      templateKey: t.templateKey,
      title: t.title,
      status: t.status,
      version: t.version,
      instructions: t.instructions,
      updatedAt: t.updatedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

adminSenecaStudioRouter.patch(
  "/prompt-templates/:templateKey",
  zValidator("json", z.object({ instructions: z.string().max(20000) })),
  async (c) => {
    const user = c.get("user")!;
    const templateKey = c.req.param("templateKey");
    const { instructions } = c.req.valid("json");
    try {
      const t = await updatePromptTemplate(prisma, owner, templateKey, instructions, user.id);
      return c.json({
        data: {
          id: t.id,
          templateKey: t.templateKey,
          title: t.title,
          status: t.status,
          version: t.version,
          instructions: t.instructions,
          updatedAt: t.updatedAt.toISOString(),
          createdAt: t.createdAt.toISOString(),
        },
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Could not update template." }, 400);
    }
  },
);

adminSenecaStudioRouter.post(
  "/preview",
  zValidator(
    "json",
    z.object({
      question: z.string().trim().min(1).max(2000),
      templateKey: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    if (!senecaAvailable()) return c.json({ error: senecaUnavailableMessage() }, 503);

    const body = c.req.valid("json");
    const started = Date.now();
    const assembled = await assembleSenecaSystemPrompt(prisma, {
      owner,
      templateKey: (body.templateKey as any) ?? "general_coaching",
      userContext: `Platform Studio preview by ${user.name ?? user.email ?? user.id}`,
      requestContext: "Preview only — no workspace operational context.",
    });

    let responseText: string;
    try {
      responseText = await senecaText(
        `Manager question for preview:\n"${body.question}"\n\nRespond as Seneca using the system coaching configuration. End with a clear suggested next step.`,
        "Platform Seneca Studio preview (no live workspace data).",
        { systemPrompt: assembled.systemPrompt },
      );
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Preview failed." }, 502);
    }

    const generation = await prisma.senecaGeneration.create({
      data: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        userId: user.id,
        source: "platform_studio_preview",
        model: env.OPENAI_MODEL,
        promptVersion: assembled.promptVersion,
        knowledgeUsed: JSON.stringify(assembled.knowledgeUsed),
        contextUsed: JSON.stringify(assembled.contextLayers),
        question: body.question,
        response: responseText,
        systemPrompt: assembled.systemPrompt.slice(0, 50000),
        latencyMs: Date.now() - started,
      },
    });

    return c.json({
      data: {
        generationId: generation.id,
        question: body.question,
        response: responseText,
        promptVersion: assembled.promptVersion,
        knowledgeUsed: assembled.knowledgeUsed,
        contextUsed: assembled.contextLayers,
        studioVersion: assembled.studioVersion,
        operationalVersion: assembled.operationalVersion,
      },
    });
  },
);

adminSenecaStudioRouter.post(
  "/generations/:id/feedback",
  zValidator(
    "json",
    z.object({
      rating: z.enum(["helpful", "needs_improvement"]),
      note: z.string().max(2000).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id");
    const generation = await prisma.senecaGeneration.findFirst({
      where: { id, ownerType: owner.ownerType, ownerId: owner.ownerId },
    });
    if (!generation) return c.json({ error: "Generation not found." }, 404);
    const body = c.req.valid("json");
    await prisma.senecaGenerationFeedback.upsert({
      where: { generationId: id },
      create: {
        generationId: id,
        rating: body.rating,
        note: body.note?.trim() || null,
        createdBy: user.id,
      },
      update: {
        rating: body.rating,
        note: body.note?.trim() || null,
        createdBy: user.id,
      },
    });
    return c.json({ data: { ok: true as const } });
  },
);
