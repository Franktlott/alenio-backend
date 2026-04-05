import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";

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

  const topicIdParam = c.req.query("topicId");
  const limitParam = c.req.query("limit");
  const take = limitParam ? parseInt(limitParam, 10) : 100;

  // Build topicId filter:
  // - no param provided → return all messages (backwards compatible)
  // - "general" → messages with no topic (topicId: null)
  // - any other value → messages belonging to that topic
  let topicFilter: { topicId?: string | null } = {};
  if (topicIdParam === "general") {
    topicFilter = { topicId: null };
  } else if (topicIdParam !== undefined) {
    topicFilter = { topicId: topicIdParam };
  }

  const messages = await prisma.message.findMany({
    where: { teamId, ...topicFilter },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: {
        include: { sender: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take,
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
  const { content, mediaUrl, mediaType, replyToId, topicId } = body;

  if (!content?.trim() && !mediaUrl) {
    return c.json({ error: { message: "Content or media is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const message = await prisma.message.create({
    data: {
      content: content?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyToId || null,
      topicId: topicId || null,
      teamId,
      senderId: user.id,
    },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
    },
  });

  // Fetch topic name if needed
  let notifBody = content?.trim() || "Sent a photo";
  if (topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { name: true } });
    if (topic) notifBody = `#${topic.name}: ${notifBody}`;
  }

  // Notify other team members
  const [members, team] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId, userId: { not: user.id } },
      select: { userId: true },
    }),
    prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
  ]);
  const memberIds = members.map((m: any) => m.userId);
  const senderName = user.name ?? "Someone";
  await sendPushToUsers(memberIds, senderName, notifBody, { teamId, teamName: team?.name ?? "", topicId: topicId || undefined }, "notifMessages");

  return c.json({ data: message }, 201);
});

// POST /api/teams/:teamId/messages/:messageId/reactions - toggle reaction
messagesRouter.post("/:messageId/reactions", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { messageId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const body = await c.req.json();
  const { emoji } = body;
  if (!emoji) return c.json({ error: { message: "Emoji is required", code: "VALIDATION_ERROR" } }, 400);

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({ data: { messageId, userId: user.id, emoji } });
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, teamId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
    },
  });

  return c.json({ data: message });
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

// POST /api/teams/:teamId/messages/unread-counts - returns unread message counts for team channels
messagesRouter.post("/unread-counts", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { lastReadIds } = await c.req.json<{ lastReadIds: Record<string, string> }>();

  const counts: Record<string, number> = {};

  await Promise.all(
    Object.entries(lastReadIds).map(async ([key, lastReadId]) => {
      let topicFilter: { topicId?: string | null } = {};
      if (key === `team:${teamId}`) {
        topicFilter = { topicId: null };
      } else if (key.startsWith("topic:")) {
        topicFilter = { topicId: key.replace("topic:", "") };
      } else {
        return;
      }

      let afterDate: Date | null = null;
      if (lastReadId) {
        const msg = await prisma.message.findUnique({
          where: { id: lastReadId },
          select: { createdAt: true },
        });
        if (msg) afterDate = msg.createdAt;
      }

      counts[key] = await prisma.message.count({
        where: {
          teamId,
          ...topicFilter,
          senderId: { not: user.id },
          ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
        },
      });
    })
  );

  return c.json({ data: counts });
});

export { messagesRouter };
