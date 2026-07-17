import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { healWalksSchemaIfNeeded, prismaRouteError } from "../lib/prisma-errors";
import { listWalkItemTypeCatalog } from "../lib/walks/item-types/registry";
import { assertCanManageWalks, assertCanViewWalks } from "../lib/walks/permissions";
import { serializeWalkItem, serializeWalkSection } from "../lib/walks/serialize";
import { WALK_ITEM_TYPES, WALK_TEMPLATE_STATUSES } from "../lib/walks/types";
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
      const result = await withWalksSchemaRetry(() =>
        walkService.createWalkItem(teamId, templateId, c.req.valid("json")),
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
      return c.json({ data: serializeWalkItem(result.item) }, 201);
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
      return c.json({ data: serializeWalkItem(result.item) });
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

export { walksRouter };
