import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const messagesRouter = new Hono<{ Variables: Variables }>();
messagesRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

// GET /api/teams/:teamId/messages - fetch last 100 messages, oldest first
messagesRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const messages = await prisma.message.findMany({
    where: { teamId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return c.json({ data: messages });
});

// POST /api/teams/:teamId/messages - send a message
messagesRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const body = await c.req.json();
  const { content } = body;

  if (!content?.trim()) {
    return c.json({ error: { message: "Message content is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const message = await prisma.message.create({
    data: {
      content: content.trim(),
      teamId,
      senderId: user.id,
    },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return c.json({ data: message }, 201);
});

// DELETE /api/teams/:teamId/messages/:messageId - delete own message or admin/owner
messagesRouter.delete("/:messageId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { messageId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const message = await prisma.message.findFirst({ where: { id: messageId, teamId } });
  if (!message) {
    return c.json({ error: { message: "Message not found", code: "NOT_FOUND" } }, 404);
  }

  // Only the sender or an owner/admin can delete
  if (message.senderId !== user.id && !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  await prisma.message.delete({ where: { id: messageId } });
  return c.body(null, 204);
});

export { messagesRouter };
