import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import {
  addHaccpCoolingReading,
  canManageHaccpForUser,
  completeHaccpRun,
  completeHaccpRunItem,
  createHaccpCoolingLog,
  createHaccpCorrectiveAction,
  createHaccpProbeCalibration,
  createHaccpTemplate,
  getFoodSafetyDashboard,
  getHaccpManagerDashboard,
  getHaccpRun,
  getHaccpTemplate,
  listHaccpCoolingLogs,
  listHaccpTemplates,
  resolveHaccpCorrectiveAction,
  seedStarterHaccpTemplates,
  startHaccpRun,
} from "../lib/haccp";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const haccpRouter = new Hono<{ Variables: Variables }>();
haccpRouter.use("*", authGuard);

const templateKindSchema = z.enum(["opening_temps", "hot_hold", "cold_hold", "closing_temps", "custom"]);
const itemStatusSchema = z.enum(["pass", "needs_attention", "na"]);
const correctiveActionSchema = z.enum([
  "discarded",
  "moved_cooler",
  "rapid_chilled",
  "maintenance",
  "rechecked_passed",
  "other",
]);

const templateItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  minTempF: z.number().nullable().optional(),
  maxTempF: z.number().nullable().optional(),
  allowNa: z.boolean().optional(),
});

const templateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: templateKindSchema,
  workplace: z.string().trim().max(200).optional(),
  windowStart: z.string().trim().max(8).nullable().optional(),
  windowEnd: z.string().trim().max(8).nullable().optional(),
  dueLabel: z.string().trim().max(80).nullable().optional(),
  photoRequired: z.boolean().optional(),
  noteRequired: z.boolean().optional(),
  bluetoothMode: z.enum(["required", "preferred", "manual_only"]).optional(),
  items: z.array(templateItemSchema).min(1).max(80),
});

async function getMembership(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({ where: { userId_teamId: { userId, teamId } } });
}

haccpRouter.get("/dashboard", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  if (!teamId) return c.json({ error: { message: "teamId required", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const dashboard = await getFoodSafetyDashboard(teamId);
  const canManage = await canManageHaccpForUser(teamId, user.id);
  return c.json({ data: { dashboard, canManage } });
});

haccpRouter.get("/manager", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  if (!teamId) return c.json({ error: { message: "teamId required", code: "VALIDATION_ERROR" } }, 400);
  if (!(await canManageHaccpForUser(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const manager = await getHaccpManagerDashboard(teamId);
  return c.json({ data: { manager } });
});

haccpRouter.post("/seed", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  if (!teamId) return c.json({ error: { message: "teamId required", code: "VALIDATION_ERROR" } }, 400);
  if (!(await canManageHaccpForUser(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const result = await seedStarterHaccpTemplates(teamId, user.id);
  return c.json({ data: result });
});

haccpRouter.get("/templates", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  if (!teamId) return c.json({ error: { message: "teamId required", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const templates = await listHaccpTemplates(teamId);
  const canManage = await canManageHaccpForUser(teamId, user.id);
  return c.json({ data: { templates, canManage } });
});

haccpRouter.post("/templates", zValidator("json", templateBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  if (!teamId) return c.json({ error: { message: "teamId required", code: "VALIDATION_ERROR" } }, 400);
  if (!(await canManageHaccpForUser(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const result = await createHaccpTemplate(teamId, user.id, body);
  if (!result.ok) return c.json({ error: { message: "Invalid template", code: "VALIDATION_ERROR" } }, 400);
  return c.json({ data: result.template }, 201);
});

haccpRouter.get("/templates/:templateId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const templateId = c.req.param("templateId")?.trim();
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await getHaccpTemplate(teamId, templateId);
  if (!result.ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { template: result.template } });
});

haccpRouter.post("/templates/:templateId/start", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const templateId = c.req.param("templateId")?.trim();
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await startHaccpRun(teamId, templateId, { userId: user.id, name: user.name ?? "Leader" });
  if (!result.ok) return c.json({ error: { message: "Could not start run", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { run: result.run } }, 201);
});

haccpRouter.get("/runs/:runId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const runId = c.req.param("runId")?.trim();
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await getHaccpRun(teamId, runId);
  if (!result.ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { run: result.run } });
});

haccpRouter.post("/runs/:runId/items/:itemId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const runId = c.req.param("runId")?.trim();
  const itemId = c.req.param("itemId")?.trim();
  const body = await c.req.json();
  const parsed = z
    .object({
      readingF: z.number().nullable().optional(),
      status: itemStatusSchema,
      entryMethod: z.enum(["manual", "bluetooth"]).optional(),
      notes: z.string().max(500).nullable().optional(),
      photoUrl: z.string().url().max(2048).nullable().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return c.json({ error: { message: "Invalid item", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await completeHaccpRunItem(teamId, runId, itemId, {
    ...parsed.data,
    actorName: user.name ?? "Leader",
  });
  if (!result.ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: result });
});

haccpRouter.post("/runs/:runId/complete", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const runId = c.req.param("runId")?.trim();
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await completeHaccpRun(teamId, runId, user.name ?? "Leader");
  if (!result.ok) {
    if (result.code === "VALIDATION") return c.json({ error: { message: "Incomplete run", code: "VALIDATION_ERROR" } }, 400);
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: { run: result.run } });
});

haccpRouter.post("/corrective-actions", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const body = await c.req.json();
  const parsed = z
    .object({
      runId: z.string().optional().nullable(),
      runItemId: z.string().optional().nullable(),
      coolingLogId: z.string().optional().nullable(),
      actionType: correctiveActionSchema,
      notes: z.string().max(500).nullable().optional(),
      photoUrl: z.string().url().max(2048).nullable().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return c.json({ error: { message: "Invalid action", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await createHaccpCorrectiveAction(teamId, {
    ...parsed.data,
    performedByUserId: user.id,
    performedByName: user.name ?? "Leader",
  });
  return c.json({ data: result.action }, 201);
});

haccpRouter.post("/corrective-actions/:actionId/resolve", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const actionId = c.req.param("actionId")?.trim();
  if (!(await canManageHaccpForUser(teamId, user.id))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const result = await resolveHaccpCorrectiveAction(teamId, actionId, user.name ?? "Leader");
  if (!result.ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { success: true } });
});

haccpRouter.get("/cooling-logs", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const logs = await listHaccpCoolingLogs(teamId);
  return c.json({ data: { logs } });
});

haccpRouter.post("/cooling-logs", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const parsed = z
    .object({ itemName: z.string().trim().min(1).max(200), firstTempF: z.number() })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: { message: "Invalid cooling log", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await createHaccpCoolingLog(teamId, {
    ...parsed.data,
    createdByName: user.name ?? "Leader",
  });
  return c.json({ data: result.log }, 201);
});

haccpRouter.post("/cooling-logs/:logId/readings", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const logId = c.req.param("logId")?.trim();
  const parsed = z.object({ tempF: z.number() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: { message: "Invalid reading", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await addHaccpCoolingReading(teamId, logId, {
    tempF: parsed.data.tempF,
    actorName: user.name ?? "Leader",
  });
  if (!result.ok) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: result });
});

haccpRouter.post("/probe-calibrations", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId")?.trim();
  const parsed = z.object({ actualTempF: z.number() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: { message: "Invalid calibration", code: "VALIDATION_ERROR" } }, 400);
  const membership = await getMembership(teamId, user.id);
  if (!membership) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  const result = await createHaccpProbeCalibration(teamId, {
    actualTempF: parsed.data.actualTempF,
    performedByName: user.name ?? "Leader",
    performedByUserId: user.id,
  });
  return c.json({ data: result.calibration }, 201);
});

export { haccpRouter };
