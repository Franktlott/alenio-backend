import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  completeWalk,
  createWalkTemplate,
  getWalkCompletionForUser,
  getWalkTemplateForUser,
  listWalkCompletionsForUser,
  listWalkTemplatesForUser,
  updateWalkTemplate,
} from "../lib/walks";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const walksRouter = new Hono<{ Variables: Variables }>();
walksRouter.use("*", authGuard);

const walkItemStatusSchema = z.enum(["pass", "needs_attention", "na"]);

const walkTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  workplace: z.string().trim().min(1).max(200),
  scoringEnabled: z.boolean().optional(),
  items: z
    .array(z.object({ label: z.string().trim().min(1).max(280) }))
    .min(1)
    .max(80),
});

const walkTemplatePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    workplace: z.string().trim().min(1).max(200).optional(),
    scoringEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    items: z
      .array(z.object({ label: z.string().trim().min(1).max(280) }))
      .min(1)
      .max(80)
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No updates provided" });
    }
  });

const walkCompleteSchema = z.object({
  responses: z
    .array(
      z.object({
        itemId: z.string().min(1),
        label: z.string().max(280),
        status: walkItemStatusSchema,
        notes: z.string().max(500).nullable().optional(),
        photoUrl: z.string().url().max(2048).nullable().optional(),
      }),
    )
    .min(1)
    .max(80),
  finalNotes: z.string().max(2000).nullable().optional(),
});

// GET /api/teams/:teamId/walks
walksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const result = await listWalkTemplatesForUser(teamId, user.id);
  if (!result.ok) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  return c.json({ data: { templates: result.templates, canManage: result.canManage } });
});

// POST /api/teams/:teamId/walks
walksRouter.post("/", zValidator("json", walkTemplateBodySchema), async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = c.req.valid("json");
  const result = await createWalkTemplate(teamId, user.id, body);
  if (!result.ok) {
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Invalid walk template", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template }, 201);
});

// GET /api/teams/:teamId/walks/completions
walksRouter.get("/completions", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const templateId = c.req.query("templateId");
  const result = await listWalkCompletionsForUser(teamId, user.id, templateId || undefined);
  if (!result.ok) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  return c.json({ data: { completions: result.completions, canManage: result.canManage } });
});

// GET /api/teams/:teamId/walks/completions/:completionId
walksRouter.get("/completions/:completionId", async (c) => {
  const user = c.get("user")!;
  const { teamId, completionId } = c.req.param();
  const result = await getWalkCompletionForUser(teamId, completionId, user.id);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  return c.json({ data: { completion: result.completion, canManage: result.canManage } });
});

// GET /api/teams/:teamId/walks/:walkId
walksRouter.get("/:walkId", async (c) => {
  const user = c.get("user")!;
  const { teamId, walkId } = c.req.param();
  const result = await getWalkTemplateForUser(teamId, walkId, user.id);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  return c.json({ data: { template: result.template, canManage: result.canManage } });
});

// PATCH /api/teams/:teamId/walks/:walkId
walksRouter.patch("/:walkId", zValidator("json", walkTemplatePatchSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, walkId } = c.req.param();
  const body = c.req.valid("json");
  const result = await updateWalkTemplate(teamId, walkId, user.id, body);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Invalid walk template", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.template });
});

// POST /api/teams/:teamId/walks/:walkId/complete
walksRouter.post("/:walkId/complete", zValidator("json", walkCompleteSchema), async (c) => {
  const user = c.get("user")!;
  const { teamId, walkId } = c.req.param();
  const body = c.req.valid("json");
  const result = await completeWalk(teamId, walkId, user.id, user.name ?? null, body);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    if (result.code === "FORBIDDEN") return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    return c.json({ error: { message: "Invalid walk completion", code: "VALIDATION_ERROR" } }, 400);
  }
  return c.json({ data: result.completion }, 201);
});

export { walksRouter };
