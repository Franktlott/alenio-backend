import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const dmsRouter = new Hono<{ Variables: Variables }>();
dmsRouter.use("*", authGuard);

// GET /api/dms - list all conversations for current user
dmsRouter.get("/", async (c) => {
  const user = c.get("user")!;

  const participations = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  const conversations = participations.map((p) => {
    const other = p.conversation.participants.find((cp) => cp.userId !== user.id);
    const lastMessage = p.conversation.messages[0] ?? null;
    return {
      id: p.conversation.id,
      createdAt: p.conversation.createdAt,
      updatedAt: p.conversation.updatedAt,
      recipient: other?.user ?? null,
      lastMessage,
    };
  });

  return c.json({ data: conversations });
});

// POST /api/dms/find-or-create - get or create a DM conversation with another user
dmsRouter.post("/find-or-create", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { recipientId } = body;

  if (!recipientId) {
    return c.json({ error: { message: "recipientId is required", code: "VALIDATION_ERROR" } }, 400);
  }
  if (recipientId === user.id) {
    return c.json({ error: { message: "Cannot DM yourself", code: "VALIDATION_ERROR" } }, 400);
  }

  // Check if conversation already exists between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      participants: { every: { userId: { in: [user.id, recipientId] } } },
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: recipientId } } },
      ],
    },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });

  if (existing) {
    const other = existing.participants.find((p) => p.userId !== user.id);
    return c.json({
      data: {
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
        recipient: other?.user ?? null,
        lastMessage: existing.messages[0] ?? null,
      },
    });
  }

  // Create new conversation
  const conversation = await prisma.conversation.create({
    data: {
      participants: {
        create: [{ userId: user.id }, { userId: recipientId }],
      },
    },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  const other = conversation.participants.find((p) => p.userId !== user.id);
  return c.json({
    data: {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      recipient: other?.user ?? null,
      lastMessage: null,
    },
  }, 201);
});

// GET /api/dms/:conversationId/messages
dmsRouter.get("/:conversationId/messages", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  const messages = await prisma.directMessage.findMany({
    where: { conversationId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  // Touch updatedAt on conversation so list re-sorts
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return c.json({ data: messages });
});

// POST /api/dms/:conversationId/messages
dmsRouter.post("/:conversationId/messages", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  const body = await c.req.json();
  const { content, mediaUrl, mediaType, replyToId } = body;
  if (!content?.trim() && !mediaUrl) {
    return c.json({ error: { message: "Content or media is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const message = await prisma.directMessage.create({
    data: {
      content: content?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyToId || null,
      conversationId,
      senderId: user.id,
    },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
    },
  });

  // Update conversation updatedAt for list sorting
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return c.json({ data: message }, 201);
});

// POST /api/dms/:conversationId/messages/:messageId/reactions - toggle reaction
dmsRouter.post("/:conversationId/messages/:messageId/reactions", async (c) => {
  const user = c.get("user")!;
  const { conversationId, messageId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const body = await c.req.json();
  const { emoji } = body;
  if (!emoji) return c.json({ error: { message: "Emoji is required", code: "VALIDATION_ERROR" } }, 400);

  const existing = await prisma.directMessageReaction.findUnique({
    where: { directMessageId_userId_emoji: { directMessageId: messageId, userId: user.id, emoji } },
  });

  if (existing) {
    await prisma.directMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.directMessageReaction.create({ data: { directMessageId: messageId, userId: user.id, emoji } });
  }

  const message = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
    },
  });

  return c.json({ data: message });
});

export { dmsRouter };
