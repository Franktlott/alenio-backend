import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  createTempCheckTemplate,
  deleteTempCheckTemplate,
  getTempCheckTemplateForUser,
  listTempCheckTemplatesForUser,
  publishTempCheckTemplate,
  unpublishTempCheckTemplate,
  updateTempCheckTemplate,
} from "../lib/temp-checks";
import { prismaRouteError } from "../lib/prisma-errors";
import {
  createTempCheckEquipment,
  deleteTempCheckEquipment,
  getTempCheckEquipmentForUser,
  listTempCheckEquipmentForUser,
  updateTempCheckEquipment,
} from "../lib/temp-check-equipment";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const tempChecksRouter = new Hono<{ Variables: Variables }>();
tempChecksRouter.use("*", authGuard);

const localTimeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:mm format");

const tempCheckActionTypeSchema = z.enum(["close", "retemp"]);

const checklistItemsSchema = z.array(z.string().trim().min(1).max(200)).max(20);

const tempCheckCorrectiveActionSchema = z.union([
  z.object({
    label: z.string().trim().min(1).max(200),
    actionType: tempCheckActionTypeSchema.optional(),
    checklistItems: checklistItemsSchema.optional(),
    requireInitials: z.boolean().optional(),
    requireNote: z.boolean().optional(),
    requirePhoto: z.boolean().optional(),
  }),
  z.string().trim().min(1).max(200),
]);

const tempCheckItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  equipmentId: z.string().trim().min(1).nullable().optional(),
  tempMinF: z.number().nullable().optional(),
  tempMaxF: z.number().nullable().optional(),
  correctiveActions: z.array(tempCheckCorrectiveActionSchema).max(12).optional(),
});

const tempCheckBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueTimeLocal: localTimeSchema,
  windowStartLocal: localTimeSchema,
  windowEndLocal: localTimeSchema,
  items: z.array(tempCheckItemSchema).min(1).max(40),
});

const tempCheckPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueTimeLocal: localTimeSchema.optional(),
    windowStartLocal: localTimeSchema.optional(),
    windowEndLocal: localTimeSchema.optional(),
    items: z.array(tempCheckItemSchema).min(1).max(40).optional(),
    isActive: z.boolean().optional(),
    isPublished: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const hasUpdate =
      body.name !== undefined ||
      body.description !== undefined ||
      body.dueTimeLocal !== undefined ||
      body.windowStartLocal !== undefined ||
      body.windowEndLocal !== undefined ||
      body.items !== undefined ||
      body.isActive !== undefined ||
      body.isPublished !== undefined;
    if (!hasUpdate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No updates provided" });
    }
  });

const tempCheckEquipmentBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  tempMinF: z.number().nullable().optional(),
  tempMaxF: z.number().nullable().optional(),
  equipmentType: z.string().trim().max(50).nullable().optional(),
  locationGroup: z.string().trim().max(200).nullable().optional(),
  checkWindowStart: z.string().trim().max(10).nullable().optional(),
  checkWindowEnd: z.string().trim().max(10).nullable().optional(),
  checkFrequency: z.string().trim().max(100).nullable().optional(),
  allowedRoles: z.array(z.string().trim().max(50)).max(10).optional(),
  flowConfig: z.unknown().optional(),
  flowStatus: z.enum(["draft", "published"]).optional(),
  flowIsComplete: z.boolean().optional(),
  autoCloseWhenInRange: z.boolean().optional(),
  requireInitialsBeforeClose: z.boolean().optional(),
  retakeWaitMinutes: z.number().int().min(0).max(120).optional(),
  maxRetakes: z.number().int().min(1).max(10).optional(),
  requireManagerNoteAfterFinalRetake: z.boolean().optional(),
  correctiveActions: z.array(tempCheckCorrectiveActionSchema).max(12).optional(),
});

const tempCheckEquipmentPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    tempMinF: z.number().nullable().optional(),
    tempMaxF: z.number().nullable().optional(),
    equipmentType: z.string().trim().max(50).nullable().optional(),
    locationGroup: z.string().trim().max(200).nullable().optional(),
    checkWindowStart: z.string().trim().max(10).nullable().optional(),
    checkWindowEnd: z.string().trim().max(10).nullable().optional(),
    checkFrequency: z.string().trim().max(100).nullable().optional(),
    allowedRoles: z.array(z.string().trim().max(50)).max(10).optional(),
    flowConfig: z.unknown().optional(),
    flowStatus: z.enum(["draft", "published"]).optional(),
    flowIsComplete: z.boolean().optional(),
    autoCloseWhenInRange: z.boolean().optional(),
    requireInitialsBeforeClose: z.boolean().optional(),
    retakeWaitMinutes: z.number().int().min(0).max(120).optional(),
    maxRetakes: z.number().int().min(1).max(10).optional(),
    requireManagerNoteAfterFinalRetake: z.boolean().optional(),
    correctiveActions: z.array(tempCheckCorrectiveActionSchema).max(12).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const hasUpdate =
      body.name !== undefined ||
      body.tempMinF !== undefined ||
      body.tempMaxF !== undefined ||
      body.equipmentType !== undefined ||
      body.locationGroup !== undefined ||
      body.checkWindowStart !== undefined ||
      body.checkWindowEnd !== undefined ||
      body.checkFrequency !== undefined ||
      body.allowedRoles !== undefined ||
      body.flowConfig !== undefined ||
      body.flowStatus !== undefined ||
      body.flowIsComplete !== undefined ||
      body.autoCloseWhenInRange !== undefined ||
      body.requireInitialsBeforeClose !== undefined ||
      body.retakeWaitMinutes !== undefined ||
      body.maxRetakes !== undefined ||
      body.requireManagerNoteAfterFinalRetake !== undefined ||
      body.correctiveActions !== undefined ||
      body.isActive !== undefined;
    if (!hasUpdate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No updates provided" });
    }
  });

tempChecksRouter.get("/equipment", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const result = await listTempCheckEquipmentForUser(teamId, user.id);
  if (!result.ok) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  return c.json({ data: { equipment: result.equipment, canManage: result.canManage } });
});

tempChecksRouter.post("/equipment", zValidator("json", tempCheckEquipmentBodySchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = c.req.valid("json");
  try {
    const result = await createTempCheckEquipment(teamId, user.id, body);
    if (!result.ok) {
      if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
      return c.json({ error: { message: "Invalid equipment standard", code: "VALIDATION_ERROR" } }, 400);
    }
    return c.json({ data: result.equipment }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temp-checks] POST /equipment failed");
  }
});

tempChecksRouter.get("/equipment/:equipmentId", async (c) => {
  const user = c.get("user")!;
  const { teamId, equipmentId } = c.req.param();
  const result = await getTempCheckEquipmentForUser(teamId, equipmentId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: { equipment: result.equipment, canManage: result.canManage } });
});

tempChecksRouter.patch("/equipment/:equipmentId", zValidator("json", tempCheckEquipmentPatchSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, equipmentId } = c.req.param();
  const body = c.req.valid("json");
  const result = await updateTempCheckEquipment(teamId, equipmentId, user.id, body);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Invalid equipment standard", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.equipment });
});

tempChecksRouter.delete("/equipment/:equipmentId", async (c) => {
  const user = c.get("user")!;
  const { teamId, equipmentId } = c.req.param();
  const result = await deleteTempCheckEquipment(teamId, equipmentId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Invalid equipment standard", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.equipment });
});

tempChecksRouter.post("/:templateId/publish", async (c) => {
  const user = c.get("user")!;
  const { teamId, templateId } = c.req.param();
  const result = await publishTempCheckTemplate(teamId, templateId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Could not publish program", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template });
});

tempChecksRouter.post("/:templateId/unpublish", async (c) => {
  const user = c.get("user")!;
  const { teamId, templateId } = c.req.param();
  const result = await unpublishTempCheckTemplate(teamId, templateId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Could not unpublish program", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template });
});

tempChecksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const result = await listTempCheckTemplatesForUser(teamId, user.id);
  if (!result.ok) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  return c.json({ data: { templates: result.templates, canManage: result.canManage } });
});

tempChecksRouter.post("/", zValidator("json", tempCheckBodySchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = c.req.valid("json");
  const result = await createTempCheckTemplate(teamId, user.id, body);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Invalid temp check template", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template }, 201);
});

tempChecksRouter.get("/:templateId", async (c) => {
  const user = c.get("user")!;
  const { teamId, templateId } = c.req.param();
  const result = await getTempCheckTemplateForUser(teamId, templateId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: { template: result.template, canManage: result.canManage } });
});

tempChecksRouter.patch("/:templateId", zValidator("json", tempCheckPatchSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, templateId } = c.req.param();
  const body = c.req.valid("json");
  const result = await updateTempCheckTemplate(teamId, templateId, user.id, body);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    if (result.code === "PUBLISHED_LOCKED") {
      return c.json(
        { error: { message: "Published programs cannot be edited. Unpublish first to make changes.", code: "PUBLISHED_LOCKED" } },
        409,
      );
    }
    return c.json({ error: { message: "Invalid temp check template", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template });
});

tempChecksRouter.delete("/:templateId", async (c) => {
  const user = c.get("user")!;
  const { teamId, templateId } = c.req.param();
  const result = await deleteTempCheckTemplate(teamId, templateId, user.id);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Invalid temp check template", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template });
});

export { tempChecksRouter };
