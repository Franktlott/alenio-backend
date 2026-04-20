import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const templatesRouter = new Hono<{ Variables: Variables }>();
templatesRouter.use("*", authGuard);

// Helper: check team membership
async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

// GET /api/teams/:teamId/templates
templatesRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const templates = await prisma.taskTemplate.findMany({
    where: { teamId, createdById: user.id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: templates.map((t) => ({
      ...t,
      subtasks: t.subtasks ? JSON.parse(t.subtasks) : [],
    })),
  });
});

const createTemplateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  attachmentUrl: z.string().url().optional().nullable(),
  subtasks: z
    .array(z.object({ title: z.string(), order: z.number() }))
    .optional()
    .nullable(),
  isRecurring: z.boolean().optional(),
  recurrenceType: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
  recurrenceInterval: z.number().int().positive().optional().nullable(),
  recurrenceDaysOfWeek: z.string().optional().nullable(),
  recurrenceDayOfMonth: z.number().int().optional().nullable(),
  incognito: z.boolean().optional(),
  isJoint: z.boolean().optional(),
});

// POST /api/teams/:teamId/templates
templatesRouter.post(
  "/",
  zValidator("json", createTemplateSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;

    const membership = await getMembership(user.id, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const { title, description, priority, attachmentUrl, subtasks, isRecurring, recurrenceType, recurrenceInterval, recurrenceDaysOfWeek, recurrenceDayOfMonth, incognito, isJoint } = c.req.valid("json");

    const template = await prisma.taskTemplate.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        priority: priority ?? "medium",
        attachmentUrl: attachmentUrl ?? null,
        subtasks: subtasks ? JSON.stringify(subtasks) : null,
        isRecurring: isRecurring ?? false,
        recurrenceType: recurrenceType ?? null,
        recurrenceInterval: recurrenceInterval ?? null,
        recurrenceDaysOfWeek: recurrenceDaysOfWeek ?? null,
        recurrenceDayOfMonth: recurrenceDayOfMonth ?? null,
        incognito: incognito ?? false,
        isJoint: isJoint ?? false,
        teamId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return c.json({ data: { ...template, subtasks: template.subtasks ? JSON.parse(template.subtasks) : [] } }, 201);
  }
);

const updateTemplateSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  attachmentUrl: z.string().url().optional().nullable(),
  subtasks: z
    .array(z.object({ title: z.string(), order: z.number() }))
    .optional()
    .nullable(),
  isRecurring: z.boolean().optional(),
  recurrenceType: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
  recurrenceInterval: z.number().int().positive().optional().nullable(),
  recurrenceDaysOfWeek: z.string().optional().nullable(),
  recurrenceDayOfMonth: z.number().int().optional().nullable(),
  incognito: z.boolean().optional(),
  isJoint: z.boolean().optional(),
});

// PATCH /api/teams/:teamId/templates/:templateId
templatesRouter.patch(
  "/:templateId",
  zValidator("json", updateTemplateSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const { templateId } = c.req.param();

    const membership = await getMembership(user.id, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.taskTemplate.findFirst({
      where: { id: templateId, teamId },
    });

    if (!existing) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    if (existing.createdById !== user.id) {
      return c.json({ error: { message: "Only the creator can update this template", code: "FORBIDDEN" } }, 403);
    }

    const { title, description, priority, attachmentUrl, subtasks, isRecurring, recurrenceType, recurrenceInterval, recurrenceDaysOfWeek, recurrenceDayOfMonth, incognito, isJoint } = c.req.valid("json");

    const updated = await prisma.taskTemplate.update({
      where: { id: templateId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(priority !== undefined && { priority }),
        ...(attachmentUrl !== undefined && { attachmentUrl: attachmentUrl ?? null }),
        ...(subtasks !== undefined && { subtasks: subtasks ? JSON.stringify(subtasks) : null }),
        ...(isRecurring !== undefined && { isRecurring }),
        ...(recurrenceType !== undefined && { recurrenceType: recurrenceType ?? null }),
        ...(recurrenceInterval !== undefined && { recurrenceInterval: recurrenceInterval ?? null }),
        ...(recurrenceDaysOfWeek !== undefined && { recurrenceDaysOfWeek: recurrenceDaysOfWeek ?? null }),
        ...(recurrenceDayOfMonth !== undefined && { recurrenceDayOfMonth: recurrenceDayOfMonth ?? null }),
        ...(incognito !== undefined && { incognito }),
        ...(isJoint !== undefined && { isJoint }),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return c.json({ data: { ...updated, subtasks: updated.subtasks ? JSON.parse(updated.subtasks) : [] } });
  }
);

// DELETE /api/teams/:teamId/templates/:templateId
templatesRouter.delete("/:templateId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { templateId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const template = await prisma.taskTemplate.findFirst({
    where: { id: templateId, teamId },
  });

  if (!template) {
    return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  }

  if (template.createdById !== user.id) {
    return c.json({ error: { message: "Only the creator can delete this template", code: "FORBIDDEN" } }, 403);
  }

  await prisma.taskTemplate.delete({ where: { id: templateId } });
  return c.body(null, 204);
});

export { templatesRouter };
