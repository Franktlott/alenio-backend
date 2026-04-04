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
    where: { teamId },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ data: templates });
});

const createTemplateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
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

    const { title, description, priority } = c.req.valid("json");

    const template = await prisma.taskTemplate.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        priority: priority ?? "medium",
        teamId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return c.json({ data: template }, 201);
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
