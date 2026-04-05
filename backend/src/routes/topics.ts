import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const topicsRouter = new Hono<{ Variables: Variables }>();
topicsRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

// GET /api/teams/:teamId/topics - list topics for a team
topicsRouter.get("/:teamId/topics", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const items = await prisma.topic.findMany({
    where: { teamId },
    orderBy: { createdAt: "asc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  return c.json({ data: items });
});

// POST /api/teams/:teamId/topics - create a topic (owner/admin only)
topicsRouter.post("/:teamId/topics", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const { name, description, color } = await c.req.json();

  if (!name?.trim()) {
    return c.json({ error: { message: "Name required", code: "VALIDATION_ERROR" } }, 400);
  }

  const member = await getMembership(user.id, teamId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: { message: "Only owners and admins can create topics", code: "FORBIDDEN" } }, 403);
  }

  const topic = await prisma.topic.create({
    data: {
      name: name.trim(),
      description: description?.trim() || undefined,
      color: color || "#4361EE",
      teamId,
      createdById: user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  return c.json({ data: topic }, 201);
});

// PATCH /api/teams/:teamId/topics/:topicId - update a topic (owner/admin only)
topicsRouter.patch("/:teamId/topics/:topicId", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();
  const { name, description, color } = await c.req.json();

  const member = await getMembership(user.id, teamId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: { message: "Only owners and admins can edit topics", code: "FORBIDDEN" } }, 403);
  }

  const topic = await prisma.topic.update({
    where: { id: topicId, teamId },
    data: {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(color ? { color } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  return c.json({ data: topic });
});

// DELETE /api/teams/:teamId/topics/:topicId - delete a topic (owner/admin only)
topicsRouter.delete("/:teamId/topics/:topicId", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();

  const member = await getMembership(user.id, teamId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return c.json({ error: { message: "Only owners and admins can delete topics", code: "FORBIDDEN" } }, 403);
  }

  await prisma.topic.delete({ where: { id: topicId, teamId } });

  return c.body(null, 204);
});

export { topicsRouter };
