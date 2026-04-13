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
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true } },
        },
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
  const { content, mediaUrl, mediaType, replyToId, topicId, mentionedUserIds } = body;
  const mentionIds: string[] = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];

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
      mentionedUserIds: JSON.stringify(mentionIds),
    },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Fire-and-forget push notifications — do not block the response
  const senderName = user.name ?? "Someone";
  const messageText = content?.trim()
    ? content.trim().slice(0, 100) + (content.trim().length > 100 ? "…" : "")
    : "📷 Photo";
  const capturedTopicId: string | undefined = topicId || undefined;
  const capturedMentionIds = mentionIds;

  void (async () => {
    try {
      const [members, team] = await Promise.all([
        prisma.teamMember.findMany({
          where: { teamId, userId: { not: user.id } },
          select: { userId: true },
        }),
        prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
      ]);

      let channelPrefix = `#general`;
      if (capturedTopicId) {
        const topic = await prisma.topic.findUnique({ where: { id: capturedTopicId }, select: { name: true } });
        if (topic) channelPrefix = `#${topic.name}`;
      }

      const notifTitle = senderName;
      const notifBody = `${channelPrefix}: ${messageText}`;
      const notifData = { teamId, teamName: team?.name ?? "", topicId: capturedTopicId, type: "message" };
      const memberIds = members.map((m: { userId: string }) => m.userId);

      await sendPushToUsers(memberIds, notifTitle, notifBody, notifData, "notifMessages");

      if (capturedMentionIds.length > 0) {
        await sendPushToUsers(
          capturedMentionIds,
          notifTitle,
          `${channelPrefix}: mentioned you — ${messageText}`,
          notifData,
          "notifMessages"
        );
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  })();

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

  // Enforce 1 reaction per user — swap if different emoji, toggle off if same
  const existingAny = await prisma.messageReaction.findFirst({
    where: { messageId, userId: user.id },
  });

  if (existingAny) {
    await prisma.messageReaction.delete({ where: { id: existingAny.id } });
    if (existingAny.emoji !== emoji) {
      await prisma.messageReaction.create({ data: { messageId, userId: user.id, emoji } });
    }
  } else {
    await prisma.messageReaction.create({ data: { messageId, userId: user.id, emoji } });
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, teamId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true } },
        },
      },
    },
  });

  return c.json({ data: message });
});

// PATCH /api/teams/:teamId/messages/:messageId - edit own message within 15 minutes
messagesRouter.patch("/:messageId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const { messageId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const message = await prisma.message.findFirst({ where: { id: messageId, teamId } });
  if (!message) return c.json({ error: { message: "Message not found", code: "NOT_FOUND" } }, 404);
  if (message.senderId !== user.id) return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);

  const ageMs = Date.now() - new Date(message.createdAt).getTime();
  if (ageMs > 15 * 60 * 1000) {
    return c.json({ error: { message: "Edit window expired", code: "EDIT_EXPIRED" } }, 400);
  }

  const body = await c.req.json();
  const content = body.content?.trim();
  if (!content) return c.json({ error: { message: "Content is required", code: "VALIDATION_ERROR" } }, 400);

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true } },
        },
      },
    },
  });

  return c.json({ data: updated });
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
