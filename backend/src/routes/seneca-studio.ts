import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { env } from "../env";
import {
  deleteDraftConfig,
  getPublishedOrDraftOperational,
  getPublishedOrDraftStudio,
  listAllKnowledge,
  listConfigVersions,
  listPromptTemplates,
  publishConfig,
  restoreConfigVersion,
  saveOperationalDraft,
  saveStudioDraft,
  updatePromptTemplate,
  workspaceOwner,
} from "../lib/seneca-config-service";
import {
  DEFAULT_OPERATIONAL_CONTEXT,
  DEFAULT_STUDIO_DATA,
  type SenecaStudioData,
  type SenecaOperationalContextData,
} from "../lib/seneca-config-types";
import { assembleForWorkspaceTeam } from "../lib/seneca-prompt-assembly";
import { senecaAvailable, senecaText, senecaUnavailableMessage } from "../lib/seneca-openai";
import { buildSenecaChatContext, senecaChatContextToPrompt } from "../lib/seneca-chat-context";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const senecaStudioRouter = new Hono<{ Variables: Variables }>();
senecaStudioRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function canViewStudio(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

function canEditStudio(role: string): boolean {
  return role === "owner" || role === "admin";
}

type StudioGate =
  | { error: Response }
  | {
      user: NonNullable<Variables["user"]>;
      teamId: string;
      membership: { role: string };
      owner: ReturnType<typeof workspaceOwner>;
      canEdit: boolean;
    };

async function requireView(c: {
  get: (key: "user") => Variables["user"];
  req: { param: (name: string) => string };
  json: (body: unknown, status?: number) => Response;
}): Promise<StudioGate> {
  const user = c.get("user");
  if (!user) return { error: c.json({ error: "Unauthorized" }, 401) };
  const teamId = c.req.param("teamId");
  const membership = await getMembership(user.id, teamId);
  if (!membership || !canViewStudio(membership.role)) {
    return { error: c.json({ error: "You do not have access to Seneca Studio." }, 403) };
  }
  return {
    user,
    teamId,
    membership,
    owner: workspaceOwner(teamId),
    canEdit: canEditStudio(membership.role),
  };
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
  canEdit: boolean,
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
    canEdit,
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

const operationalBodySchema = z.object({
  operationalContext: z.object({
    currentPriorities: z.array(z.string().trim().min(1).max(200)).max(40),
    currentGoals: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().trim().min(1).max(200),
          description: z.string().max(2000),
          targetDate: z.string().nullable(),
          priority: z.enum(["low", "medium", "high"]),
          status: z.enum(["active", "completed", "paused"]),
        }),
      )
      .max(40),
    currentInitiatives: z.array(z.string().trim().min(1).max(200)).max(40),
    focusAreas: z.array(z.string().trim().min(1).max(80)).max(40),
    workspaceNotes: z.string().max(12000),
    recognitionPreferences: z.object({
      publicRecognition: z.boolean(),
      privateRecognition: z.boolean(),
      celebrateMilestones: z.boolean(),
      celebrateTrainingCompletion: z.boolean(),
      celebrateCustomerWins: z.boolean(),
    }),
  }),
});

senecaStudioRouter.get("/studio", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const { owner, canEdit } = gate;
  const studio = await getPublishedOrDraftStudio(prisma, owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(
        studio.row,
        studio.source,
        canEdit,
        authorId ? names.get(authorId) ?? null : null,
      ),
      studio: studio.data,
    },
  });
});

senecaStudioRouter.put("/studio", zValidator("json", studioBodySchema), async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  if (!gate.canEdit) return c.json({ error: "Only workspace owners can edit Seneca Studio." }, 403);
  const body = c.req.valid("json");
  const data = { ...DEFAULT_STUDIO_DATA, ...body.studio } as SenecaStudioData;
  await saveStudioDraft(prisma, gate.owner, data, gate.user.id, body.notes);
  const studio = await getPublishedOrDraftStudio(prisma, gate.owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(studio.row, studio.source, true, authorId ? names.get(authorId) ?? null : null),
      studio: studio.data,
    },
  });
});

senecaStudioRouter.post("/studio/publish", zValidator("json", notesOnlySchema), async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  if (!gate.canEdit) return c.json({ error: "Only workspace owners can publish." }, 403);
  const body = c.req.valid("json");
  try {
    await publishConfig(prisma, gate.owner, "STUDIO", gate.user.id, body.notes);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Could not publish." }, 400);
  }
  const studio = await getPublishedOrDraftStudio(prisma, gate.owner);
  const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
  const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
  return c.json({
    data: {
      ...metaFromRow(studio.row, studio.source, true, authorId ? names.get(authorId) ?? null : null),
      studio: studio.data,
    },
  });
});

senecaStudioRouter.get("/studio/versions", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const versions = await listConfigVersions(prisma, gate.owner, "STUDIO");
  const names = await resolveUserNames(versions.flatMap((v) => [v.publishedBy, v.createdBy]));
  return c.json({ data: versions.map((v) => versionRow(v, names)) });
});

senecaStudioRouter.post(
  "/studio/restore",
  zValidator("json", z.object({ version: z.number().int().positive() })),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can restore versions." }, 403);
    const { version } = c.req.valid("json");
    try {
      await restoreConfigVersion(prisma, gate.owner, "STUDIO", version, gate.user.id);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Could not restore." }, 400);
    }
    const studio = await getPublishedOrDraftStudio(prisma, gate.owner);
    const names = await resolveUserNames([studio.row?.publishedBy, studio.row?.createdBy]);
    const authorId = studio.row?.publishedBy || studio.row?.createdBy || null;
    return c.json({
      data: {
        ...metaFromRow(studio.row, studio.source, true, authorId ? names.get(authorId) ?? null : null),
        studio: studio.data,
      },
    });
  },
);

senecaStudioRouter.delete("/studio/versions/:version", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  if (!gate.canEdit) return c.json({ error: "Only workspace owners can delete drafts." }, 403);
  const version = Number(c.req.param("version"));
  if (!Number.isInteger(version) || version < 1) {
    return c.json({ error: "Invalid version." }, 400);
  }
  try {
    await deleteDraftConfig(prisma, gate.owner, "STUDIO", version);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Could not delete draft." }, 400);
  }
  return c.json({ data: { ok: true as const } });
});

senecaStudioRouter.get("/operational-context", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const operational = await getPublishedOrDraftOperational(prisma, gate.owner);
  return c.json({
    data: {
      ...metaFromRow(operational.row, operational.source, gate.canEdit),
      operationalContext: operational.data,
    },
  });
});

senecaStudioRouter.put(
  "/operational-context",
  zValidator("json", operationalBodySchema),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can edit workspace context." }, 403);
    const body = c.req.valid("json");
    const data = {
      ...DEFAULT_OPERATIONAL_CONTEXT,
      ...body.operationalContext,
      recognitionPreferences: {
        ...DEFAULT_OPERATIONAL_CONTEXT.recognitionPreferences,
        ...body.operationalContext.recognitionPreferences,
      },
    } as SenecaOperationalContextData;
    await saveOperationalDraft(prisma, gate.owner, data, gate.user.id);
    const operational = await getPublishedOrDraftOperational(prisma, gate.owner);
    return c.json({
      data: {
        ...metaFromRow(operational.row, operational.source, true),
        operationalContext: operational.data,
      },
    });
  },
);

senecaStudioRouter.post("/operational-context/publish", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  if (!gate.canEdit) return c.json({ error: "Only workspace owners can publish." }, 403);
  try {
    await publishConfig(prisma, gate.owner, "OPERATIONAL_CONTEXT", gate.user.id);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Could not publish." }, 400);
  }
  const operational = await getPublishedOrDraftOperational(prisma, gate.owner);
  return c.json({
    data: {
      ...metaFromRow(operational.row, operational.source, true),
      operationalContext: operational.data,
    },
  });
});

senecaStudioRouter.get("/operational-context/versions", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const versions = await listConfigVersions(prisma, gate.owner, "OPERATIONAL_CONTEXT");
  const names = await resolveUserNames(versions.flatMap((v) => [v.publishedBy, v.createdBy]));
  return c.json({ data: versions.map((v) => versionRow(v, names)) });
});

senecaStudioRouter.post(
  "/operational-context/restore",
  zValidator("json", z.object({ version: z.number().int().positive() })),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can restore versions." }, 403);
    const { version } = c.req.valid("json");
    try {
      await restoreConfigVersion(prisma, gate.owner, "OPERATIONAL_CONTEXT", version, gate.user.id);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Could not restore." }, 400);
    }
    const operational = await getPublishedOrDraftOperational(prisma, gate.owner);
    return c.json({
      data: {
        ...metaFromRow(operational.row, operational.source, true),
        operationalContext: operational.data,
      },
    });
  },
);

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

senecaStudioRouter.get("/knowledge", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const rows = await listAllKnowledge(prisma, gate.owner);
  return c.json({ data: rows.map(serializeKnowledge) });
});

senecaStudioRouter.post(
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
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can manage knowledge." }, 403);
    const body = c.req.valid("json");
    const row = await prisma.senecaKnowledge.create({
      data: {
        ownerType: gate.owner.ownerType,
        ownerId: gate.owner.ownerId,
        title: body.title,
        category: body.category?.trim() || "general",
        description: body.description?.trim() || null,
        contentText: body.contentText ?? "",
        status: body.status ?? "ACTIVE",
        createdBy: gate.user.id,
      },
    });
    return c.json({ data: serializeKnowledge(row) });
  },
);

senecaStudioRouter.patch(
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
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can manage knowledge." }, 403);
    const id = c.req.param("id");
    const existing = await prisma.senecaKnowledge.findFirst({
      where: { id, ownerType: gate.owner.ownerType, ownerId: gate.owner.ownerId },
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
        createdBy: gate.user.id,
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

senecaStudioRouter.delete("/knowledge/:id", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  if (!gate.canEdit) return c.json({ error: "Only workspace owners can manage knowledge." }, 403);
  const id = c.req.param("id");
  const existing = await prisma.senecaKnowledge.findFirst({
    where: { id, ownerType: gate.owner.ownerType, ownerId: gate.owner.ownerId },
  });
  if (!existing) return c.json({ error: "Document not found." }, 404);
  await prisma.senecaKnowledge.delete({ where: { id } });
  return c.json({ data: { ok: true as const } });
});

senecaStudioRouter.get("/prompt-templates", async (c) => {
  const gate = await requireView(c);
  if ("error" in gate) return gate.error;
  const rows = await listPromptTemplates(prisma, gate.owner);
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

senecaStudioRouter.patch(
  "/prompt-templates/:templateKey",
  zValidator("json", z.object({ instructions: z.string().max(20000) })),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can edit templates." }, 403);
    const templateKey = c.req.param("templateKey");
    const { instructions } = c.req.valid("json");
    try {
      const t = await updatePromptTemplate(prisma, gate.owner, templateKey, instructions, gate.user.id);
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

senecaStudioRouter.post(
  "/preview",
  zValidator(
    "json",
    z.object({
      question: z.string().trim().min(1).max(2000),
      templateKey: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    if (!gate.canEdit) return c.json({ error: "Only workspace owners can run preview." }, 403);
    if (!senecaAvailable()) return c.json({ error: senecaUnavailableMessage() }, 503);

    const body = c.req.valid("json");
    const started = Date.now();
    const chatCtx = await buildSenecaChatContext(gate.teamId, gate.user.id);
    const assembled = await assembleForWorkspaceTeam(prisma, gate.teamId, {
      templateKey: (body.templateKey as any) ?? "general_coaching",
      requestContext: senecaChatContextToPrompt(chatCtx),
      userContext: `Preview requested by ${gate.user.name ?? gate.user.email ?? gate.user.id}`,
    });

    let responseText: string;
    try {
      responseText = await senecaText(
        `Manager question for preview:\n"${body.question}"\n\nRespond as Seneca using the system coaching configuration. End with a clear suggested next step.`,
        senecaChatContextToPrompt(chatCtx),
        { systemPrompt: assembled.systemPrompt },
      );
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Preview failed." }, 502);
    }

    const generation = await prisma.senecaGeneration.create({
      data: {
        ownerType: gate.owner.ownerType,
        ownerId: gate.owner.ownerId,
        userId: gate.user.id,
        source: "studio_preview",
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

senecaStudioRouter.post(
  "/generations/:id/feedback",
  zValidator(
    "json",
    z.object({
      rating: z.enum(["helpful", "needs_improvement"]),
      note: z.string().max(2000).optional(),
    }),
  ),
  async (c) => {
    const gate = await requireView(c);
    if ("error" in gate) return gate.error;
    const id = c.req.param("id");
    const generation = await prisma.senecaGeneration.findFirst({
      where: { id, ownerType: gate.owner.ownerType, ownerId: gate.owner.ownerId },
    });
    if (!generation) return c.json({ error: "Generation not found." }, 404);
    const body = c.req.valid("json");
    await prisma.senecaGenerationFeedback.upsert({
      where: { generationId: id },
      create: {
        generationId: id,
        rating: body.rating,
        note: body.note?.trim() || null,
        createdBy: gate.user.id,
      },
      update: {
        rating: body.rating,
        note: body.note?.trim() || null,
        createdBy: gate.user.id,
      },
    });
    return c.json({ data: { ok: true as const } });
  },
);
