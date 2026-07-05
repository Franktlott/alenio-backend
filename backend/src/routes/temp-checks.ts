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
  updateTempCheckTemplate,
} from "../lib/temp-checks";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const tempChecksRouter = new Hono<{ Variables: Variables }>();
tempChecksRouter.use("*", authGuard);

const localTimeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:mm format");

const tempCheckItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  tempMinF: z.number().nullable().optional(),
  tempMaxF: z.number().nullable().optional(),
  correctiveActions: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
});

const tempCheckBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueTimeLocal: localTimeSchema,
  windowStartLocal: localTimeSchema,
  windowEndLocal: localTimeSchema,
  items: z.array(tempCheckItemSchema).min(1).max(40),
  outOfWindowActions: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
});

const tempCheckPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueTimeLocal: localTimeSchema.optional(),
    windowStartLocal: localTimeSchema.optional(),
    windowEndLocal: localTimeSchema.optional(),
    items: z.array(tempCheckItemSchema).min(1).max(40).optional(),
    outOfWindowActions: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No updates provided" });
    }
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
