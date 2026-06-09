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

const oneOnOneTemplatesRouter = new Hono<{ Variables: Variables }>();
oneOnOneTemplatesRouter.use("*", authGuard);

const fieldTypeSchema = z.enum([
  "short_text",
  "long_text",
  "rating",
  "manager_notes",
  "associate_notes",
]);

const fieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  type: fieldTypeSchema,
  order: z.number().int().min(0),
  required: z.boolean().optional(),
  ratingMax: z.number().int().min(2).max(10).optional(),
});

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function parseFields(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function serializeTemplate(template: {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  fields: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
}) {
  return {
    id: template.id,
    teamId: template.teamId,
    title: template.title,
    description: template.description,
    fields: parseFields(template.fields),
    createdById: template.createdById,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    createdBy: template.createdBy,
  };
}

const upsertSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().max(500).optional().nullable(),
  fields: z.array(fieldSchema).min(1, "Add at least one field"),
});

// GET /api/teams/:teamId/one-on-one-templates
oneOnOneTemplatesRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const templates = await prisma.oneOnOneTemplate.findMany({
    where: { teamId },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return c.json({ data: templates.map(serializeTemplate) });
});

// POST /api/teams/:teamId/one-on-one-templates
oneOnOneTemplatesRouter.post("/", zValidator("json", upsertSchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: { message: "Only the workspace owner can create 1:1 templates", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const fields = [...body.fields].sort((a, b) => a.order - b.order);

  const template = await prisma.oneOnOneTemplate.create({
    data: {
      teamId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      fields: JSON.stringify(fields),
      createdById: user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return c.json({ data: serializeTemplate(template) }, 201);
});

// PATCH /api/teams/:teamId/one-on-one-templates/:templateId
oneOnOneTemplatesRouter.patch(
  "/:templateId",
  zValidator("json", upsertSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const templateId = c.req.param("templateId") as string;

    const membership = await getMembership(user.id, teamId);
    if (!membership || membership.role !== "owner") {
      return c.json({ error: { message: "Only the workspace owner can edit 1:1 templates", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.oneOnOneTemplate.findFirst({
      where: { id: templateId, teamId },
    });
    if (!existing) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const body = c.req.valid("json");
    const fields = [...body.fields].sort((a, b) => a.order - b.order);

    const template = await prisma.oneOnOneTemplate.update({
      where: { id: templateId },
      data: {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        fields: JSON.stringify(fields),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return c.json({ data: serializeTemplate(template) });
  },
);

// DELETE /api/teams/:teamId/one-on-one-templates/:templateId
oneOnOneTemplatesRouter.delete("/:templateId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const templateId = c.req.param("templateId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: { message: "Only the workspace owner can delete 1:1 templates", code: "FORBIDDEN" } }, 403);
  }

  const existing = await prisma.oneOnOneTemplate.findFirst({
    where: { id: templateId, teamId },
  });
  if (!existing) {
    return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.oneOnOneTemplate.delete({ where: { id: templateId } });
  return c.json({ data: { deleted: true } });
});

export { oneOnOneTemplatesRouter };
