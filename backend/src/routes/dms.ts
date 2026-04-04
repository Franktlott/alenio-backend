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
    const conv = p.conversation;
    const lastMessage = conv.messages[0] ?? null;

    if (conv.isGroup) {
      return {
        id: conv.id,
        isGroup: true,
        name: conv.name,
        participants: conv.participants.map(cp => cp.user),
        recipient: null,
        lastMessage,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    }

    const other = conv.participants.find((cp) => cp.userId !== user.id);
    return {
      id: conv.id,
      isGroup: false,
      name: null,
      participants: conv.participants.map(cp => cp.user),
      recipient: other?.user ?? null,
      lastMessage,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
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

  // Check if conversation already exists between these two users (non-group only)
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
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
        isGroup: false,
        name: null,
        participants: existing.participants.map(cp => cp.user),
        recipient: other?.user ?? null,
        lastMessage: existing.messages[0] ?? null,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      },
    });
  }

  // Create new conversation
  const conversation = await prisma.conversation.create({
    data: {
      isGroup: false,
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
      isGroup: false,
      name: null,
      participants: conversation.participants.map(cp => cp.user),
      recipient: other?.user ?? null,
      lastMessage: null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  }, 201);
});

// POST /api/dms/create-group - create a group conversation
dmsRouter.post("/create-group", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name, participantIds } = body;

  if (!name?.trim()) {
    return c.json({ error: { message: "Group name is required", code: "VALIDATION_ERROR" } }, 400);
  }
  if (!Array.isArray(participantIds) || participantIds.length < 1) {
    return c.json({ error: { message: "At least one participant is required", code: "VALIDATION_ERROR" } }, 400);
  }

  // Include the creator + all participants (deduplicated)
  const allIds = Array.from(new Set([user.id, ...participantIds]));

  const conversation = await prisma.conversation.create({
    data: {
      name: name.trim(),
      isGroup: true,
      participants: {
        create: allIds.map((userId) => ({ userId })),
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

  return c.json({
    data: {
      id: conversation.id,
      isGroup: true,
      name: conversation.name,
      participants: conversation.participants.map(p => p.user),
      recipient: null,
      lastMessage: null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
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
