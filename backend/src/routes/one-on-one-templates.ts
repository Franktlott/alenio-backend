import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const oneOnOneTemplatesRouter = new Hono<{ Variables: Variables }>();
oneOnOneTemplatesRouter.use("*", authGuard);

const fieldTypeSchema = z.enum([
  "section",
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
  helpText: z.string().max(500).optional().nullable(),
  associateRequest: z.enum(["task", "message"]).optional().nullable(),
});

async function getMembership(
  c: { get: (key: "user" | "session") => unknown },
  teamId: string,
) {
  const user = c.get("user") as { id?: string } | null;
  const session = c.get("session") as { user?: { id?: string } } | null;
  const ids = [...new Set([user?.id, session?.user?.id].filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (const userId of ids) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (membership) return membership;
  }
  return null;
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
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  try {
    const templates = await prisma.oneOnOneTemplate.findMany({
      where: { teamId },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return c.json({ data: templates.map(serializeTemplate) });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-templates] GET failed");
  }
});

// POST /api/teams/:teamId/one-on-one-templates
oneOnOneTemplatesRouter.post("/", zValidator("json", upsertSchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: { message: "Only the workspace owner can create check-in templates", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const fields = [...body.fields].sort((a, b) => a.order - b.order);

  try {
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
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-templates] POST failed");
  }
});

// PATCH /api/teams/:teamId/one-on-one-templates/:templateId
oneOnOneTemplatesRouter.patch(
  "/:templateId",
  zValidator("json", upsertSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const templateId = c.req.param("templateId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || membership.role !== "owner") {
      return c.json({ error: { message: "Only the workspace owner can edit check-in templates", code: "FORBIDDEN" } }, 403);
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
  const teamId = c.req.param("teamId") as string;
  const templateId = c.req.param("templateId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: { message: "Only the workspace owner can delete check-in templates", code: "FORBIDDEN" } }, 403);
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
