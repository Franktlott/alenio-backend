import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { healWalksSchemaIfNeeded, prismaRouteError } from "../lib/prisma-errors";
import { listWalkItemTypeCatalog } from "../lib/walks/item-types/registry";
import { assertCanManageWalks, assertCanViewWalks } from "../lib/walks/permissions";
import { serializeWalkSection } from "../lib/walks/serialize";
import { WALK_ITEM_TYPES, WALK_LIBRARY_CATEGORIES, WALK_TEMPLATE_STATUSES } from "../lib/walks/types";
import * as libraryService from "../lib/walks/library-service";
import * as publishService from "../lib/walks/publish-service";
import * as reportingService from "../lib/walks/reporting-service";
import * as scheduleService from "../lib/walks/schedule-service";
import * as walkRunService from "../lib/walks/walk-run-service";
import * as walkService from "../lib/walks/walk-template-service";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const walksRouter = new Hono<{ Variables: Variables }>();
walksRouter.use("*", authGuard);

function userId(c: { get: (k: "user" | "session") => unknown }): string | null {
  const user = c.get("user") as { id?: string } | null;
  const session = c.get("session") as { user?: { id?: string } } | null;
  return user?.id || session?.user?.id || null;
}

async function withWalksSchemaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const healed = await healWalksSchemaIfNeeded(err);
    if (!healed) throw err;
    return await fn();
  }
}

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  workplace: z.string().max(120).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(24 * 60).optional().nullable(),
});

const patchTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  workplace: z.string().max(120).optional(),
  scoringEnabled: z.boolean().optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(24 * 60).optional().nullable(),
  status: z.enum(WALK_TEMPLATE_STATUSES).optional(),
});

const sectionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
});

const patchSectionSchema = sectionSchema.partial();

const createItemSchema = z.object({
  type: z.enum(WALK_ITEM_TYPES),
  title: z.string().min(1).max(200),
  sectionId: z.string().min(1).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
  required: z.boolean().optional(),
  failureBehavior: z.string().max(80).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const patchItemSchema = z.object({
  type: z.enum(WALK_ITEM_TYPES).optional(),
  title: z.string().min(1).max(200).optional(),
  sectionId: z.string().min(1).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
  required: z.boolean().optional(),
  failureBehavior: z.string().max(80).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional(),
  libraryItemVersionId: z.string().min(1).optional(),
  pinToCurrentVersion: z.boolean().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

const reorderItemsSchema = reorderSchema.extend({
  sectionId: z.string().min(1).optional().nullable(),
});

// GET /api/teams/:teamId/walks/item-types
walksRouter.get("/item-types", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  return c.json({ data: listWalkItemTypeCatalog() });
});

// GET /api/teams/:teamId/walks/templates
walksRouter.get("/templates", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await withWalksSchemaRetry(() => walkService.listWalkTemplates(teamId));
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list walk templates");
  }
});

// POST /api/teams/:teamId/walks/templates
walksRouter.post("/templates", zValidator("json", createTemplateSchema), async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  const body = c.req.valid("json");
  try {
    const data = await withWalksSchemaRetry(() =>
      walkService.createWalkTemplate({
        teamId,
        userId: uid,
        name: body.name,
        description: body.description,
        workplace: body.workplace,
        estimatedDurationMinutes: body.estimatedDurationMinutes,
      }),
    );
    return c.json({ data }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "Failed to create walk template");
  }
});

// GET /api/teams/:teamId/walks/templates/:templateId
walksRouter.get("/templates/:templateId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await withWalksSchemaRetry(() => walkService.getWalkTemplate(teamId, templateId));
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load walk template");
  }
});

// PATCH /api/teams/:teamId/walks/templates/:templateId
walksRouter.patch("/templates/:templateId", zValidator("json", patchTemplateSchema), async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await withWalksSchemaRetry(() =>
      walkService.updateWalkTemplate(teamId, templateId, c.req.valid("json")),
    );
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to update walk template");
  }
});

// DELETE /api/teams/:teamId/walks/templates/:templateId
walksRouter.delete("/templates/:templateId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const ok = await walkService.deleteWalkTemplate(teamId, templateId);
    if (!ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data: { ok: true } });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to delete walk template");
  }
});

// POST .../templates/:templateId/sections
walksRouter.post(
  "/templates/:templateId/sections",
  zValidator("json", sectionSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const section = await walkService.createWalkSection(teamId, templateId, c.req.valid("json"));
      if (!section) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      return c.json({ data: serializeWalkSection(section) }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to create section");
    }
  },
);

walksRouter.patch(
  "/templates/:templateId/sections/:sectionId",
  zValidator("json", patchSectionSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const sectionId = c.req.param("sectionId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const section = await walkService.updateWalkSection(
        teamId,
        templateId,
        sectionId,
        c.req.valid("json"),
      );
      if (!section) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      return c.json({ data: serializeWalkSection(section) });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to update section");
    }
  },
);

walksRouter.delete("/templates/:templateId/sections/:sectionId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const sectionId = c.req.param("sectionId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const ok = await walkService.deleteWalkSection(teamId, templateId, sectionId);
    if (!ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data: { ok: true } });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to delete section");
  }
});

walksRouter.post(
  "/templates/:templateId/sections/reorder",
  zValidator("json", reorderSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const data = await walkService.reorderWalkSections(
        teamId,
        templateId,
        c.req.valid("json").orderedIds,
      );
      if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      return c.json({ data });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("REORDER_")) {
        return c.json({ error: { message: "Invalid reorder payload", code: "VALIDATION_ERROR" } }, 400);
      }
      return prismaRouteError(c, err, "Failed to reorder sections");
    }
  },
);

walksRouter.post(
  "/templates/:templateId/items",
  zValidator("json", createItemSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const body = c.req.valid("json");
      const result = await withWalksSchemaRetry(() =>
        walkService.createWalkItem(teamId, templateId, { ...body, userId: uid }),
      );
      if ("error" in result) {
        if (result.error === "NOT_FOUND") {
          return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
        }
        return c.json(
          { error: { message: result.message ?? result.error, code: "VALIDATION_ERROR" } },
          400,
        );
      }
      return c.json({ data: result.item }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to create item");
    }
  },
);

walksRouter.patch(
  "/templates/:templateId/items/:itemId",
  zValidator("json", patchItemSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const itemId = c.req.param("itemId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const result = await walkService.updateWalkItem(
        teamId,
        templateId,
        itemId,
        c.req.valid("json"),
        uid,
      );
      if ("error" in result) {
        if (result.error === "NOT_FOUND") {
          return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
        }
        return c.json(
          { error: { message: result.message ?? result.error, code: "VALIDATION_ERROR" } },
          400,
        );
      }
      return c.json({ data: result.item });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to update item");
    }
  },
);

walksRouter.delete("/templates/:templateId/items/:itemId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const itemId = c.req.param("itemId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const ok = await walkService.deleteWalkItem(teamId, templateId, itemId);
    if (!ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data: { ok: true } });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to delete item");
  }
});

walksRouter.post(
  "/templates/:templateId/items/reorder",
  zValidator("json", reorderItemsSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    const body = c.req.valid("json");
    try {
      const data = await walkService.reorderWalkItems(
        teamId,
        templateId,
        body.orderedIds,
        body.sectionId,
      );
      if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      return c.json({ data });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("REORDER_")) {
        return c.json({ error: { message: "Invalid reorder payload", code: "VALIDATION_ERROR" } }, 400);
      }
      return prismaRouteError(c, err, "Failed to reorder items");
    }
  },
);

const startRunSchema = z.object({
  isTest: z.boolean().optional(),
  testSessionId: z.string().optional().nullable(),
});

const submitResponseSchema = z.object({
  response: z.unknown(),
  notes: z.string().max(4000).optional().nullable(),
  photoUrls: z.array(z.string().url()).max(20).optional().nullable(),
});

// GET published templates (any member can list for running)
walksRouter.get("/published", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await walkRunService.listPublishedWalkTemplates(teamId);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list published walks");
  }
});

walksRouter.post(
  "/templates/:templateId/runs",
  zValidator("json", startRunSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanViewWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    const body = c.req.valid("json");
    try {
      const user = c.get("user") as { name?: string | null } | null;
      const result = await walkRunService.startWalkRun({
        teamId,
        templateId,
        startedByUserId: uid,
        startedByName: user?.name ?? null,
        isTest: body.isTest,
        testSessionId: body.testSessionId,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to start walk");
    }
  },
);

walksRouter.get("/runs/:runId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const runId = c.req.param("runId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await walkRunService.getWalkRun(teamId, runId);
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load walk run");
  }
});

walksRouter.patch(
  "/runs/:runId/items/:itemId",
  zValidator("json", submitResponseSchema),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const runId = c.req.param("runId")!;
    const itemId = c.req.param("itemId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanViewWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    const body = c.req.valid("json");
    try {
      const user = c.get("user") as { name?: string | null } | null;
      const result = await walkRunService.submitWalkItemResponse({
        teamId,
        runId,
        itemId,
        response: body.response,
        notes: body.notes,
        photoUrls: body.photoUrls,
        completedBy: user?.name ?? uid,
      });
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" || result.error === "ITEM_NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to submit walk response");
    }
  },
);

walksRouter.post("/runs/:runId/complete", async (c) => {
  const teamId = c.req.param("teamId")!;
  const runId = c.req.param("runId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await walkRunService.completeWalkRun(teamId, runId);
    if ("error" in result) {
      const status = result.error === "NOT_FOUND" ? 404 : 400;
      return c.json(
        { error: { message: result.message ?? result.error, code: result.error } },
        status,
      );
    }
    return c.json({ data: result.run });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to complete walk");
  }
});

walksRouter.post(
  "/runs/:runId/items/:itemId/corrective-actions/:actionId/complete",
  zValidator(
    "json",
    z.object({
      response: z.unknown().optional(),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const runId = c.req.param("runId")!;
    const itemId = c.req.param("itemId")!;
    const actionId = c.req.param("actionId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanViewWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const user = c.get("user") as { name?: string | null } | null;
      const result = await walkRunService.completeCorrectiveAction({
        teamId,
        runId,
        itemId,
        correctiveActionId: actionId,
        response: c.req.valid("json").response,
        completedBy: user?.name ?? uid,
      });
      if ("error" in result) {
        return c.json(
          { error: { message: result.error, code: result.error } },
          result.error === "NOT_FOUND" || result.error === "ITEM_NOT_FOUND" || result.error === "ACTION_NOT_FOUND"
            ? 404
            : 400,
        );
      }
      return c.json({ data: result.run });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to complete corrective action");
    }
  },
);

// ── Item Library ────────────────────────────────────────────────────────────

walksRouter.get("/library/categories", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  return c.json({ data: WALK_LIBRARY_CATEGORIES });
});

walksRouter.get("/library/items", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await libraryService.listLibraryItems(teamId, {
      q: c.req.query("q") ?? undefined,
      type: c.req.query("type") ?? undefined,
      category: c.req.query("category") ?? undefined,
      status: (c.req.query("status") as "ACTIVE" | "ARCHIVED" | "ALL" | undefined) ?? "ACTIVE",
    });
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list library items");
  }
});

const libraryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(80).optional(),
  type: z.enum(WALK_ITEM_TYPES),
  instructions: z.string().max(4000).optional().nullable(),
  requiredDefault: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  deviceMethods: z.record(z.string(), z.unknown()).optional(),
});

walksRouter.post("/library/items", zValidator("json", libraryCreateSchema), async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await libraryService.createLibraryItem({
      teamId,
      userId: uid,
      ...c.req.valid("json"),
    });
    if ("error" in result) {
      return c.json(
        { error: { message: result.message ?? result.error, code: result.error } },
        400,
      );
    }
    return c.json({ data: result.item }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "Failed to create library item");
  }
});

walksRouter.get("/library/items/:itemId", async (c) => {
  const teamId = c.req.param("teamId")!;
  const itemId = c.req.param("itemId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await libraryService.getLibraryItem(teamId, itemId);
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load library item");
  }
});

walksRouter.patch(
  "/library/items/:itemId",
  zValidator(
    "json",
    libraryCreateSchema.partial().extend({
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const itemId = c.req.param("itemId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const result = await libraryService.updateLibraryItem(
        teamId,
        itemId,
        uid,
        c.req.valid("json"),
      );
      if ("error" in result) {
        const status = result.error === "NOT_FOUND" ? 404 : 400;
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          status,
        );
      }
      return c.json({ data: result.item });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to update library item");
    }
  },
);

walksRouter.post("/library/items/:itemId/duplicate", async (c) => {
  const teamId = c.req.param("teamId")!;
  const itemId = c.req.param("itemId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await libraryService.duplicateLibraryItem(teamId, itemId, uid);
    if ("error" in result) {
      return c.json({ error: { message: result.error, code: result.error } }, 404);
    }
    return c.json({ data: result.item }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "Failed to duplicate library item");
  }
});

walksRouter.post("/library/items/:itemId/archive", async (c) => {
  const teamId = c.req.param("teamId")!;
  const itemId = c.req.param("itemId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await libraryService.archiveLibraryItem(teamId, itemId, uid);
    if ("error" in result) {
      return c.json({ error: { message: result.error, code: result.error } }, 404);
    }
    return c.json({ data: result.item });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to archive library item");
  }
});

walksRouter.get("/library/items/:itemId/usage", async (c) => {
  const teamId = c.req.param("teamId")!;
  const itemId = c.req.param("itemId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await libraryService.getLibraryItemUsage(teamId, itemId);
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load library usage");
  }
});

walksRouter.put(
  "/library/items/:itemId/corrective-actions",
  zValidator(
    "json",
    z.object({
      actions: z.array(
        z.object({
          trigger: z.string().optional(),
          actionType: z.string().min(1),
          title: z.string().min(1).max(200),
          instructions: z.string().max(4000).optional().nullable(),
          required: z.boolean().optional(),
          blocksCompletion: z.boolean().optional(),
          config: z.unknown().optional(),
        }),
      ),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const itemId = c.req.param("itemId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const result = await libraryService.replaceCorrectiveActions(
        teamId,
        itemId,
        uid,
        c.req.valid("json").actions,
      );
      if ("error" in result) {
        return c.json({ error: { message: result.error, code: result.error } }, 404);
      }
      return c.json({ data: result.item });
    } catch (err) {
      return prismaRouteError(c, err, "Failed to save corrective actions");
    }
  },
);

// ── Builder: add from library / outdated / publish ───────────────────────────

walksRouter.post(
  "/templates/:templateId/items/from-library",
  zValidator(
    "json",
    z.object({
      libraryItemId: z.string().min(1),
      libraryItemVersionId: z.string().optional().nullable(),
      sectionId: z.string().optional().nullable(),
      requiredOverride: z.boolean().optional().nullable(),
      instructionsOverride: z.string().max(4000).optional().nullable(),
      titleOverride: z.string().max(200).optional().nullable(),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const templateId = c.req.param("templateId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const result = await walkService.addLibraryItemToWalk(
        teamId,
        templateId,
        c.req.valid("json"),
      );
      if ("error" in result) {
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          result.error === "NOT_FOUND" || result.error === "LIBRARY_NOT_FOUND" ? 404 : 400,
        );
      }
      return c.json({ data: result.item }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to add library item");
    }
  },
);

walksRouter.get("/templates/:templateId/outdated-items", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await walkService.listOutdatedPlacements(teamId, templateId);
    if (!data) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list outdated items");
  }
});

walksRouter.post("/templates/:templateId/publish", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await publishService.publishWalkTemplate(teamId, templateId, uid);
    if ("error" in result) {
      return c.json(
        { error: { message: result.message ?? result.error, code: result.error } },
        result.error === "NOT_FOUND" ? 404 : 400,
      );
    }
    return c.json({ data: result });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to publish walk");
  }
});

walksRouter.post("/templates/:templateId/create-draft", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await publishService.createDraftFromPublished(teamId, templateId, uid);
    if ("error" in result) {
      return c.json({ error: { message: result.error, code: result.error } }, 404);
    }
    return c.json({ data: result.template }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "Failed to create draft");
  }
});

walksRouter.post("/templates/:templateId/archive", async (c) => {
  const teamId = c.req.param("teamId")!;
  const templateId = c.req.param("templateId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const result = await publishService.archiveWalkTemplate(teamId, templateId);
    if ("error" in result) {
      return c.json({ error: { message: result.error, code: result.error } }, 404);
    }
    return c.json({ data: result.template });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to archive walk");
  }
});

walksRouter.get("/runs", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const rows = await walkRunService.listWalkRuns(teamId);
    return c.json({ data: rows });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list runs");
  }
});

// ── Schedules / occurrences ─────────────────────────────────────────────────

walksRouter.get("/schedules", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await scheduleService.listSchedules(teamId, c.req.query("templateId") ?? undefined);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list schedules");
  }
});

walksRouter.post(
  "/schedules",
  zValidator(
    "json",
    z.object({
      templateId: z.string().min(1),
      name: z.string().max(120).optional().nullable(),
      timezone: z.string().max(80).optional(),
      recurrence: z.enum(["ONCE", "DAILY", "WEEKLY"]).optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().nullable(),
      effectiveFrom: z.string().datetime().optional(),
      effectiveTo: z.string().datetime().optional().nullable(),
      assignScope: z.enum(["WORKSPACE", "ROLE", "TEAM", "MEMBER", "ANY"]).optional(),
      assignRole: z.string().optional().nullable(),
      assignUserIds: z.array(z.string()).optional().nullable(),
      completionMode: z.enum(["ANY_ONE", "EVERY_ASSIGNEE"]).optional(),
      claimMode: z.enum(["FIRST_START_OWNS", "SHARED_RESUME"]).optional(),
      managerApprovalRequired: z.boolean().optional(),
      requiredCompletionCount: z.number().int().min(1).optional(),
      missedBehavior: z.enum(["MARK_MISSED", "CARRY_OPEN"]).optional(),
      notifyEnabled: z.boolean().optional(),
      windows: z
        .array(
          z.object({
            startMinutes: z.number().int().min(0).max(1439),
            dueMinutes: z.number().int().min(0).max(1439),
            graceMinutes: z.number().int().min(0).max(24 * 60).optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanManageWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    const body = c.req.valid("json");
    try {
      const result = await scheduleService.createSchedule({
        teamId,
        ...body,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      });
      if ("error" in result) {
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          result.error === "NOT_FOUND" ? 404 : 400,
        );
      }
      return c.json({ data: result.schedule }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to create schedule");
    }
  },
);

walksRouter.get("/occurrences", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await scheduleService.listOccurrences(teamId, {
      templateId: c.req.query("templateId") ?? undefined,
      status: c.req.query("status") ?? undefined,
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
    });
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list occurrences");
  }
});

walksRouter.get("/occurrences/available", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanViewWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await scheduleService.listAvailableOccurrences(teamId);
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to list available occurrences");
  }
});

walksRouter.post(
  "/occurrences/:occurrenceId/runs",
  zValidator(
    "json",
    z.object({
      isTest: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const teamId = c.req.param("teamId")!;
    const occurrenceId = c.req.param("occurrenceId")!;
    const uid = userId(c);
    if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    const gate = await assertCanViewWalks(teamId, uid);
    if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
    try {
      const user = c.get("user") as { name?: string | null } | null;
      const occ = await scheduleService.listOccurrences(teamId);
      const match = occ.find((o) => o.id === occurrenceId);
      if (!match) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
      const result = await walkRunService.startWalkRun({
        teamId,
        templateId: match.templateId,
        occurrenceId,
        startedByUserId: uid,
        startedByName: user?.name ?? null,
        isTest: c.req.valid("json").isTest,
      });
      if ("error" in result) {
        return c.json(
          { error: { message: result.message ?? result.error, code: result.error } },
          result.error === "NOT_FOUND" ? 404 : 400,
        );
      }
      return c.json({ data: result.run }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "Failed to start occurrence run");
    }
  },
);

walksRouter.get("/reporting/summary", async (c) => {
  const teamId = c.req.param("teamId")!;
  const uid = userId(c);
  if (!uid) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const gate = await assertCanManageWalks(teamId, uid);
  if (!gate.ok) return c.json({ error: { message: gate.message, code: "FORBIDDEN" } }, gate.status);
  try {
    const data = await reportingService.getWalkReportingSummary(teamId, {
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
    });
    return c.json({ data });
  } catch (err) {
    return prismaRouteError(c, err, "Failed to load walk reporting");
  }
});

export { walksRouter };
