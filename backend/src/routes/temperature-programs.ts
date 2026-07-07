import type { Context } from "hono";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";
import {
  activateTempProgram,
  archiveTempProgram,
  attachCorrectiveRule,
  createAssignment,
  createCheckItem,
  createCorrectiveTemplate,
  createEquipmentGroup,
  createEquipmentItem,
  createSchedule,
  createTempProgram,
  createTempProgramDraftVersion,
  deactivateAssignment,
  deactivateCheckItem,
  deactivateCorrectiveTemplate,
  deactivateEquipmentGroup,
  deactivateEquipmentItem,
  deactivateSchedule,
  getTempProgramForUser,
  listTempProgramsForUser,
  removeCorrectiveRule,
  reorderCheckItems,
  reorderEquipmentGroups,
  reorderEquipmentItems,
  seedTemperatureProgramDemo,
  updateAssignment,
  updateCheckItem,
  updateCorrectiveRule,
  updateCorrectiveTemplate,
  updateEquipmentGroup,
  updateEquipmentItem,
  updateSchedule,
  updateTempProgram,
  validateTempProgramForUser,
} from "../lib/temperature-programs";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables; Bindings: object; Params: { teamId: string; programId?: string } }>();
router.use("*", authGuard);

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
});

const equipmentGroupReorderSchema = reorderSchema;
const equipmentReorderSchema = reorderSchema.extend({
  equipmentGroupId: z.string().min(1),
});
const checkItemReorderSchema = reorderSchema.extend({
  equipmentId: z.string().min(1),
});

const programBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
});

const programPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "No updates provided" });

const equipmentGroupBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const equipmentGroupPatchSchema = equipmentGroupBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const equipmentBodySchema = z.object({
  equipmentGroupId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  equipmentType: z.string().trim().max(120).nullable().optional(),
  locationHint: z.string().trim().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isRequired: z.boolean().optional(),
});

const equipmentPatchSchema = equipmentBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const checkTypeSchema = z.enum([
  "hot_holding",
  "cold_holding",
  "freezer",
  "product",
  "water_bottle",
  "equipment_surface",
]);

const checkItemBodySchema = z.object({
  equipmentId: z.string().min(1),
  name: z.string().trim().min(1).max(280),
  instruction: z.string().trim().max(2000).nullable().optional(),
  productName: z.string().trim().max(200).nullable().optional(),
  tempUnit: z.enum(["F", "C"]).optional(),
  minTemp: z.number().nullable().optional(),
  maxTemp: z.number().nullable().optional(),
  targetTemp: z.number().nullable().optional(),
  checkType: checkTypeSchema,
  allowNa: z.boolean().optional(),
  requireCommentIfNa: z.boolean().optional(),
  requirePhoto: z.boolean().optional(),
  manualEntryAllowed: z.boolean().optional(),
  bluetoothProbeAllowed: z.boolean().optional(),
  bluetoothProbeRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const checkItemPatchSchema = checkItemBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const scheduleTypeSchema = z.enum(["specific_times", "interval", "opening", "closing"]);

const scheduleBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  scheduleType: scheduleTypeSchema,
  specificTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(48).optional(),
  intervalHours: z.number().int().min(1).max(24).nullable().optional(),
  windowBeforeMinutes: z.number().int().min(0).max(720).optional(),
  windowAfterMinutes: z.number().int().min(0).max(720).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  timezone: z.string().trim().max(64).nullable().optional(),
});

const schedulePatchSchema = scheduleBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const assignmentTypeSchema = z.enum(["company", "region", "district", "workplace"]);

const assignmentBodySchema = z.object({
  assignmentType: assignmentTypeSchema,
  assignmentTargetId: z.string().trim().min(1).max(128),
  effectiveStartDate: z.string().datetime().nullable().optional(),
  effectiveEndDate: z.string().datetime().nullable().optional(),
});

const assignmentPatchSchema = assignmentBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const actionTypeSchema = z.enum([
  "discard_product",
  "reheat_product",
  "move_product",
  "call_manager",
  "maintenance_ticket",
  "retake_temperature",
  "other",
]);

const correctiveTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  actionType: actionTypeSchema,
  requiresRecheck: z.boolean().optional(),
  recheckDelayMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  requiresComment: z.boolean().optional(),
  requiresPhoto: z.boolean().optional(),
  requiresManagerApproval: z.boolean().optional(),
  closeAfterAction: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const correctiveTemplatePatchSchema = correctiveTemplateBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const conditionTypeSchema = z.enum(["below_min", "above_max", "no_reading", "equipment_unavailable"]);

const correctiveRuleBodySchema = z.object({
  checkItemId: z.string().min(1),
  correctiveActionTemplateId: z.string().min(1),
  conditionType: conditionTypeSchema,
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const correctiveRulePatchSchema = correctiveRuleBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

function mapError(c: Context, result: { ok: false; code: string; validation?: unknown }) {
  if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (result.code === "LOCKED") {
    return c.json(
      {
        error: {
          message: "This program version is locked. Create a new draft version to make changes.",
          code: "PROGRAM_LOCKED",
        },
      },
      409,
    );
  }
  if (result.code === "INVALID_STATE") {
    return c.json({ error: { message: "Invalid program state for this action.", code: "INVALID_STATE" } }, 409);
  }
  if (result.code === "VALIDATION") {
    return c.json(
      {
        error: {
          message: "Program validation failed.",
          code: "VALIDATION_ERROR",
          validation: result.validation ?? undefined,
        },
      },
      400,
    );
  }
  return c.json({ error: { message: "Invalid request", code: "VALIDATION_ERROR" } }, 400);
}

// Programs
router.get("/", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const result = await listTempProgramsForUser(teamId, user.id);
    if (!result.ok) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ data: { programs: result.programs, canManage: result.canManage } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] GET / failed");
  }
});

router.post("/", zValidator("json", programBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const result = await createTempProgram(teamId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: result.program }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST / failed");
  }
});

router.post("/seed-demo", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const result = await seedTemperatureProgramDemo(teamId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program, created: result.created } }, result.created ? 201 : 200);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST /seed-demo failed");
  }
});

router.get("/:programId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await getTempProgramForUser(teamId, programId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program, canManage: result.canManage } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] GET /:id failed");
  }
});

router.patch("/:programId", zValidator("json", programPatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await updateTempProgram(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH /:id failed");
  }
});

router.post("/:programId/validate", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await validateTempProgramForUser(teamId, programId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { validation: result.validation, canManage: result.canManage } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST /:id/validate failed");
  }
});

router.post("/:programId/activate", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await activateTempProgram(teamId, programId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program, validation: result.validation } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST /:id/activate failed");
  }
});

router.post("/:programId/archive", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await archiveTempProgram(teamId, programId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST /:id/archive failed");
  }
});

router.post("/:programId/new-draft-version", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createTempProgramDraftVersion(teamId, programId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST /:id/new-draft-version failed");
  }
});

// Equipment groups
router.post("/:programId/equipment-groups", zValidator("json", equipmentGroupBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createEquipmentGroup(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { group: result.group } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST equipment-groups failed");
  }
});

router.patch("/:programId/equipment-groups/:groupId", zValidator("json", equipmentGroupPatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, groupId } = c.req.param();
    const result = await updateEquipmentGroup(teamId, programId, groupId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { group: result.group } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH equipment-group failed");
  }
});

router.delete("/:programId/equipment-groups/:groupId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, groupId } = c.req.param();
    const result = await deactivateEquipmentGroup(teamId, programId, groupId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { group: result.group } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE equipment-group failed");
  }
});

router.post("/:programId/equipment-groups/reorder", zValidator("json", equipmentGroupReorderSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await reorderEquipmentGroups(teamId, programId, user.id, c.req.valid("json").orderedIds);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST equipment-groups/reorder failed");
  }
});

// Equipment
router.post("/:programId/equipment", zValidator("json", equipmentBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createEquipmentItem(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { equipment: result.equipment } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST equipment failed");
  }
});

router.patch("/:programId/equipment/:equipmentId", zValidator("json", equipmentPatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, equipmentId } = c.req.param();
    const result = await updateEquipmentItem(teamId, programId, equipmentId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { equipment: result.equipment } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH equipment failed");
  }
});

router.delete("/:programId/equipment/:equipmentId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, equipmentId } = c.req.param();
    const result = await deactivateEquipmentItem(teamId, programId, equipmentId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { equipment: result.equipment } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE equipment failed");
  }
});

router.post("/:programId/equipment/reorder", zValidator("json", equipmentReorderSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const body = c.req.valid("json");
    const result = await reorderEquipmentItems(teamId, programId, user.id, body.equipmentGroupId, body.orderedIds);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST equipment/reorder failed");
  }
});

// Check items
router.post("/:programId/check-items", zValidator("json", checkItemBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createCheckItem(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { checkItem: result.checkItem } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST check-items failed");
  }
});

router.patch("/:programId/check-items/:checkItemId", zValidator("json", checkItemPatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, checkItemId } = c.req.param();
    const result = await updateCheckItem(teamId, programId, checkItemId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { checkItem: result.checkItem } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH check-item failed");
  }
});

router.delete("/:programId/check-items/:checkItemId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, checkItemId } = c.req.param();
    const result = await deactivateCheckItem(teamId, programId, checkItemId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { checkItem: result.checkItem } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE check-item failed");
  }
});

router.post("/:programId/check-items/reorder", zValidator("json", checkItemReorderSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const body = c.req.valid("json");
    const result = await reorderCheckItems(teamId, programId, user.id, body.equipmentId, body.orderedIds);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { program: result.program } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST check-items/reorder failed");
  }
});

// Schedules
router.post("/:programId/schedules", zValidator("json", scheduleBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createSchedule(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { schedule: result.schedule } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST schedules failed");
  }
});

router.patch("/:programId/schedules/:scheduleId", zValidator("json", schedulePatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, scheduleId } = c.req.param();
    const result = await updateSchedule(teamId, programId, scheduleId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { schedule: result.schedule } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH schedule failed");
  }
});

router.delete("/:programId/schedules/:scheduleId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, scheduleId } = c.req.param();
    const result = await deactivateSchedule(teamId, programId, scheduleId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { schedule: result.schedule } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE schedule failed");
  }
});

// Assignments
router.post("/:programId/assignments", zValidator("json", assignmentBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createAssignment(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { assignment: result.assignment } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST assignments failed");
  }
});

router.patch("/:programId/assignments/:assignmentId", zValidator("json", assignmentPatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, assignmentId } = c.req.param();
    const result = await updateAssignment(teamId, programId, assignmentId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { assignment: result.assignment } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH assignment failed");
  }
});

router.delete("/:programId/assignments/:assignmentId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, assignmentId } = c.req.param();
    const result = await deactivateAssignment(teamId, programId, assignmentId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { assignment: result.assignment } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE assignment failed");
  }
});

// Corrective action templates
router.post("/:programId/corrective-actions", zValidator("json", correctiveTemplateBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await createCorrectiveTemplate(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { template: result.template } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST corrective-actions failed");
  }
});

router.patch("/:programId/corrective-actions/:templateId", zValidator("json", correctiveTemplatePatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, templateId } = c.req.param();
    const result = await updateCorrectiveTemplate(teamId, programId, templateId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { template: result.template } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH corrective-action failed");
  }
});

router.delete("/:programId/corrective-actions/:templateId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, templateId } = c.req.param();
    const result = await deactivateCorrectiveTemplate(teamId, programId, templateId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { template: result.template } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE corrective-action failed");
  }
});

// Corrective action rules
router.post("/:programId/corrective-action-rules", zValidator("json", correctiveRuleBodySchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId } = c.req.param();
    const result = await attachCorrectiveRule(teamId, programId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { rule: result.rule } }, 201);
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] POST corrective-action-rules failed");
  }
});

router.patch("/:programId/corrective-action-rules/:ruleId", zValidator("json", correctiveRulePatchSchema), async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, ruleId } = c.req.param();
    const result = await updateCorrectiveRule(teamId, programId, ruleId, user.id, c.req.valid("json"));
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { rule: result.rule } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] PATCH corrective-action-rule failed");
  }
});

router.delete("/:programId/corrective-action-rules/:ruleId", async (c) => {
  try {
    const user = c.get("user")!;
    const { teamId, programId, ruleId } = c.req.param();
    const result = await removeCorrectiveRule(teamId, programId, ruleId, user.id);
    if (!result.ok) return mapError(c, result);
    return c.json({ data: { rule: result.rule } });
  } catch (err) {
    return prismaRouteError(c, err, "[temperature-programs] DELETE corrective-action-rule failed");
  }
});

export { router as temperatureProgramsRouter };
