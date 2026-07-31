import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { publishDmMessageCreated, publishUserInboxUpdated, publishDmPinUpdated } from "../lib/realtime-hub";
import { MAX_CHAT_PINS } from "../lib/ensure-pinned-message-schema";
import { env } from "../env";
import {
  assertParticipantsShareWorkspaceWithCreator,
  assertPersonalGroupParticipantsAllowed,
  listGroupMemberCandidates,
  resolveGroupConversationContext,
} from "../lib/group-conversation-workspace";
import {
  canMessage,
  isBlockedEitherWay,
  messagePermissionErrorMessage,
} from "../lib/messaging-permission";
import { recordAccountActivity } from "../lib/account-activity";
import { buildDmPairKey } from "../lib/dm-pair-key";
import {
  canDeleteGroup,
  canManageGroupAdmins,
  canManageGroupMembers,
  canRemoveGroupParticipant,
  canTransferGroupOwnership,
  formatGroupParticipants,
} from "../lib/group-conversation-roles";
import { deleteReplacedStorageObject, deleteOwnedStorageUrls, deleteStorageObjectByUrlIfOwned } from "../lib/firebase-storage";
import type { ConversationParticipantRole } from "@prisma/client";
import { Prisma } from "@prisma/client";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const dmsRouter = new Hono<{ Variables: Variables }>();
dmsRouter.use("*", authGuard);

const participantUserSelect = { id: true, name: true, email: true, image: true } as const;

async function getGroupParticipant(
  conversationId: string,
  userId: string,
) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: { select: { id: true, isGroup: true, image: true, teamId: true } },
    },
  });
}

function myGroupRole(
  participants: Array<{ userId: string; role: ConversationParticipantRole }>,
  userId: string,
): ConversationParticipantRole | null {
  return participants.find((participant) => participant.userId === userId)?.role ?? null;
}

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
              user: { select: participantUserSelect },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  const conversations = await Promise.all(
    participations.map(async (p) => {
      const conv = p.conversation;
      const lastMessage = conv.messages[0] ?? null;

      if (conv.isGroup) {
        const workspaceContext = await resolveGroupConversationContext(
          user.id,
          conv.participants.map((cp) => cp.userId),
          conv.teamId,
        );

        return {
          id: conv.id,
          type: "GROUP" as const,
          isGroup: true,
          name: conv.name,
          image: conv.image ?? null,
          teamId: conv.teamId ?? null,
          workspaceId: conv.teamId ?? null,
          participants: formatGroupParticipants(conv.participants),
          myRole: myGroupRole(conv.participants, user.id),
          recipient: null,
          workspaceContext,
          lastMessage,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        };
      }

      const participantUsers = conv.participants.map((cp) => cp.user);

      const other = conv.participants.find((cp) => cp.userId !== user.id);
      return {
        id: conv.id,
        type: "DIRECT" as const,
        isGroup: false,
        name: null,
        teamId: null,
        workspaceId: null,
        participants: participantUsers,
        recipient: other?.user ?? null,
        workspaceContext: null,
        lastMessage,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    }),
  );

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

  const pairKey = buildDmPairKey(user.id, recipientId);

  const includeShape = {
    participants: {
      include: {
        user: { select: participantUserSelect },
      },
    },
    messages: {
      orderBy: { createdAt: "desc" as const },
      take: 1,
      include: { sender: { select: { id: true, name: true, image: true } } },
    },
  };

  const formatDm = (existing: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    participants: Array<{ userId: string; user: { id: string; name: string | null; email: string | null; image: string | null } }>;
    messages: Array<unknown>;
  }, status: 200 | 201 = 200) => {
    const other = existing.participants.find((p) => p.userId !== user.id);
    return c.json(
      {
        data: {
          id: existing.id,
          type: "DIRECT" as const,
          isGroup: false,
          name: null,
          participants: existing.participants.map((cp) => cp.user),
          recipient: other?.user ?? null,
          lastMessage: existing.messages[0] ?? null,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
      },
      status,
    );
  };

  // A block closes an existing thread too; a mere privacy setting does not, so
  // people who already talk keep their conversation when preferences change later.
  const permission = await canMessage(user.id, recipientId);
  if (permission.reason === "blocked") {
    return c.json(
      { error: { message: messagePermissionErrorMessage("blocked"), code: "MESSAGING_BLOCKED" } },
      403,
    );
  }

  const byKey = await prisma.conversation.findUnique({
    where: { dmPairKey: pairKey },
    include: includeShape,
  });
  if (byKey && !byKey.isGroup) {
    return formatDm(byKey);
  }

  // Legacy rows without dmPairKey
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      participants: { every: { userId: { in: [user.id, recipientId] } } },
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: recipientId } } },
      ],
    },
    include: includeShape,
  });

  if (existing) {
    if (!existing.dmPairKey) {
      try {
        await prisma.conversation.update({
          where: { id: existing.id },
          data: { dmPairKey: pairKey },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
          throw err;
        }
        const winner = await prisma.conversation.findUnique({
          where: { dmPairKey: pairKey },
          include: includeShape,
        });
        if (winner) return formatDm(winner);
      }
    }
    return formatDm(existing);
  }

  if (!permission.allowed) {
    return c.json(
      {
        error: {
          message: messagePermissionErrorMessage(permission.reason),
          code: "MESSAGING_NOT_ALLOWED",
        },
      },
      403,
    );
  }

  try {
    let created = false;
    const conversation = await prisma.$transaction(async (tx) => {
      const raced = await tx.conversation.findUnique({
        where: { dmPairKey: pairKey },
        include: includeShape,
      });
      if (raced && !raced.isGroup) return raced;

      created = true;
      return tx.conversation.create({
        data: {
          isGroup: false,
          dmPairKey: pairKey,
          participants: {
            create: [{ userId: user.id }, { userId: recipientId }],
          },
        },
        include: includeShape,
      });
    });

    return formatDm(conversation, created ? 201 : 200);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.conversation.findUnique({
        where: { dmPairKey: pairKey },
        include: includeShape,
      });
      if (winner) return formatDm(winner);
    }
    throw err;
  }
});

// GET /api/dms/group-member-candidates — teammates across all of the user's workspaces
dmsRouter.get("/group-member-candidates", async (c) => {
  const user = c.get("user")!;
  const q = c.req.query("q")?.trim() ?? "";
  const teamId = c.req.query("teamId")?.trim() || null;
  const personal = c.req.query("scope")?.trim() === "personal";
  const candidates = await listGroupMemberCandidates(user.id, q, teamId, { personal });
  return c.json({ data: candidates });
});

// POST /api/dms/create-group - create a group conversation
dmsRouter.post("/create-group", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name, participantIds, teamId: rawTeamId, image: rawImage } = body;
  const teamId = typeof rawTeamId === "string" && rawTeamId.trim() ? rawTeamId.trim() : null;
  const image =
    typeof rawImage === "string" && rawImage.trim() ? rawImage.trim() : null;

  if (!name?.trim()) {
    return c.json({ error: { message: "Group name is required", code: "VALIDATION_ERROR" } }, 400);
  }
  if (!Array.isArray(participantIds) || participantIds.length < 1) {
    return c.json({ error: { message: "At least one participant is required", code: "VALIDATION_ERROR" } }, 400);
  }

  try {
    // Workspace groups keep the organization's membership rules; personal groups
    // (no teamId) are governed by messaging permission instead.
    if (teamId) {
      await assertParticipantsShareWorkspaceWithCreator(user.id, participantIds, teamId);
    } else {
      await assertPersonalGroupParticipantsAllowed(user.id, participantIds);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid group participants.";
    return c.json({ error: { message, code: "VALIDATION_ERROR" } }, 400);
  }

  // Include the creator + all participants (deduplicated)
  const allIds = Array.from(new Set([user.id, ...participantIds]));

  const conversation = await prisma.conversation.create({
    data: {
      name: name.trim(),
      isGroup: true,
      teamId,
      image,
      participants: {
        create: allIds.map((userId) => ({
          userId,
          role: userId === user.id ? "owner" : "member",
        })),
      },
    },
    include: {
      participants: {
        include: {
          user: { select: participantUserSelect },
        },
      },
    },
  });

  const workspaceContext = await resolveGroupConversationContext(
    user.id,
    conversation.participants.map((participant) => participant.userId),
    conversation.teamId,
  );

  return c.json({
    data: {
      id: conversation.id,
      type: "GROUP" as const,
      isGroup: true,
      name: conversation.name,
      image: conversation.image ?? null,
      teamId: conversation.teamId ?? null,
      workspaceId: conversation.teamId ?? null,
      participants: formatGroupParticipants(conversation.participants),
      myRole: "owner" as const,
      recipient: null,
      workspaceContext,
      lastMessage: null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  }, 201);
});

// PATCH /api/dms/:conversationId — update group name/photo (owner only)
dmsRouter.patch("/:conversationId", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();
  const body = await c.req.json<{ image?: string | null; name?: string }>();

  const actor = await getGroupParticipant(conversationId, user.id);
  if (!actor?.conversation.isGroup) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageGroupMembers(actor.role)) {
    return c.json({ error: { message: "Only group owners and admins can update group details", code: "FORBIDDEN" } }, 403);
  }

  const data: { image?: string | null; name?: string } = {};
  if (body.image !== undefined) {
    if (body.image === null) {
      data.image = null;
    } else if (typeof body.image === "string" && body.image.trim()) {
      data.image = body.image.trim();
    } else {
      return c.json({ error: { message: "Invalid image", code: "VALIDATION_ERROR" } }, 400);
    }
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return c.json({ error: { message: "Group name is required", code: "VALIDATION_ERROR" } }, 400);
    }
    data.name = name;
  }

  if (Object.keys(data).length === 0) {
    return c.json({ error: { message: "Nothing to update", code: "VALIDATION_ERROR" } }, 400);
  }

  if (data.image !== undefined) {
    await deleteReplacedStorageObject(actor.conversation.image, data.image);
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data,
    include: {
      participants: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });

  const workspaceContext = await resolveGroupConversationContext(
    user.id,
    updated.participants.map((participant) => participant.userId),
    updated.teamId,
  );

  return c.json({
    data: {
      id: updated.id,
      type: "GROUP" as const,
      isGroup: true,
      name: updated.name,
      image: updated.image ?? null,
      teamId: updated.teamId ?? null,
      workspaceId: updated.teamId ?? null,
      participants: formatGroupParticipants(updated.participants),
      myRole: myGroupRole(updated.participants, user.id),
      recipient: null,
      workspaceContext,
      lastMessage: null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});

// GET /api/dms/:conversationId/messages/pin
dmsRouter.get("/:conversationId/messages/pin", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const pins = await prisma.conversationPin.findMany({
    where: { conversationId },
    orderBy: [{ sortOrder: "asc" }, { pinnedAt: "asc" }],
    include: {
      directMessage: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
      pinnedBy: { select: { id: true, name: true, image: true } },
    },
    take: MAX_CHAT_PINS,
  });

  return c.json({
    data: pins.map((pin) => ({
      messageId: pin.directMessage.id,
      content: pin.directMessage.content,
      mediaUrl: pin.directMessage.mediaUrl,
      mediaType: pin.directMessage.mediaType as "image" | "video" | null,
      sender: pin.directMessage.sender,
      pinnedAt: pin.pinnedAt.toISOString(),
      pinnedBy: pin.pinnedBy,
    })),
  });
});

// PUT /api/dms/:conversationId/messages/pin
dmsRouter.put("/:conversationId/messages/pin", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();
  const body = await c.req.json<{ messageId?: string }>();
  const messageId = body.messageId?.trim();
  if (!messageId) {
    return c.json({ error: { message: "messageId required", code: "BAD_REQUEST" } }, 400);
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const message = await prisma.directMessage.findFirst({
    where: { id: messageId, conversationId },
    select: {
      id: true,
      content: true,
      mediaUrl: true,
      mediaType: true,
      sender: { select: { id: true, name: true, image: true } },
    },
  });
  if (!message) {
    return c.json({ error: { message: "Message not found", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.conversationPin.findUnique({
    where: {
      conversationId_directMessageId: { conversationId, directMessageId: messageId },
    },
  });
  if (!existing) {
    const count = await prisma.conversationPin.count({ where: { conversationId } });
    if (count >= MAX_CHAT_PINS) {
      return c.json(
        { error: { message: `You can pin up to ${MAX_CHAT_PINS} messages`, code: "PIN_LIMIT" } },
        400,
      );
    }
    await prisma.conversationPin.create({
      data: {
        conversationId,
        directMessageId: messageId,
        pinnedById: user.id,
        sortOrder: count,
      },
    });
  }

  const pins = await prisma.conversationPin.findMany({
    where: { conversationId },
    orderBy: [{ sortOrder: "asc" }, { pinnedAt: "asc" }],
    include: {
      directMessage: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
      pinnedBy: { select: { id: true, name: true, image: true } },
    },
    take: MAX_CHAT_PINS,
  });
  const summaries = pins.map((pin) => ({
    messageId: pin.directMessage.id,
    content: pin.directMessage.content,
    mediaUrl: pin.directMessage.mediaUrl,
    mediaType: pin.directMessage.mediaType as "image" | "video" | null,
    sender: pin.directMessage.sender,
    pinnedAt: pin.pinnedAt.toISOString(),
    pinnedBy: pin.pinnedBy,
  }));
  publishDmPinUpdated({ conversationId, pinnedMessages: summaries });
  return c.json({ data: summaries });
});

// DELETE /api/dms/:conversationId/messages/pin?messageId=
dmsRouter.delete("/:conversationId/messages/pin", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();
  const messageId = c.req.query("messageId")?.trim();
  if (!messageId) {
    return c.json({ error: { message: "messageId required", code: "BAD_REQUEST" } }, 400);
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  await prisma.conversationPin.deleteMany({
    where: { conversationId, directMessageId: messageId },
  });

  const remaining = await prisma.conversationPin.findMany({
    where: { conversationId },
    orderBy: [{ sortOrder: "asc" }, { pinnedAt: "asc" }],
  });
  await Promise.all(
    remaining.map((pin, index) =>
      prisma.conversationPin.update({
        where: { id: pin.id },
        data: { sortOrder: index },
      }),
    ),
  );

  const pins = await prisma.conversationPin.findMany({
    where: { conversationId },
    orderBy: [{ sortOrder: "asc" }, { pinnedAt: "asc" }],
    include: {
      directMessage: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
      pinnedBy: { select: { id: true, name: true, image: true } },
    },
    take: MAX_CHAT_PINS,
  });
  const summaries = pins.map((pin) => ({
    messageId: pin.directMessage.id,
    content: pin.directMessage.content,
    mediaUrl: pin.directMessage.mediaUrl,
    mediaType: pin.directMessage.mediaType as "image" | "video" | null,
    sender: pin.directMessage.sender,
    pinnedAt: pin.pinnedAt.toISOString(),
    pinnedBy: pin.pinnedBy,
  }));
  publishDmPinUpdated({ conversationId, pinnedMessages: summaries });
  return c.json({ data: summaries });
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

  const limitParam = c.req.query("limit");
  const beforeId = c.req.query("before");
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;
  const take = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

  let beforeCreatedAt: Date | undefined;
  if (beforeId) {
    const beforeMessage = await prisma.directMessage.findFirst({
      where: { id: beforeId, conversationId },
      select: { createdAt: true },
    });
    if (!beforeMessage) {
      return c.json({ data: { messages: [], hasMore: false, nextCursor: null } });
    }
    beforeCreatedAt = beforeMessage.createdAt;
  }

  const messageInclude = {
    sender: { select: { id: true, name: true, email: true, image: true } },
    reactions: { include: { user: { select: { id: true, name: true, image: true } } } },
    replyTo: {
      select: {
        id: true,
        content: true,
        mediaUrl: true,
        mediaType: true,
        sender: { select: { id: true, name: true, image: true } },
      },
    },
  } as const;

  const messages = await prisma.directMessage.findMany({
    where: {
      conversationId,
      ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });

  const hasMore = messages.length > take;
  const page = messages.slice(0, take).reverse();
  const nextCursor = hasMore && page.length > 0 ? page[0].id : null;

  // Touch updatedAt on conversation so list re-sorts
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return c.json({ data: { messages: page, hasMore, nextCursor } });
});

// POST /api/dms/:conversationId/messages
dmsRouter.post("/:conversationId/messages", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    include: { conversation: { select: { isGroup: true } } },
  });
  if (!participant) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  // Defence in depth for 1:1 threads: a block placed after the conversation
  // existed must stop new messages, not just new conversations.
  if (!participant.conversation.isGroup) {
    const other = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: user.id } },
      select: { userId: true },
    });
    if (other && (await isBlockedEitherWay(user.id, other.userId))) {
      return c.json(
        { error: { message: messagePermissionErrorMessage("blocked"), code: "MESSAGING_BLOCKED" } },
        403,
      );
    }
  }

  const body = await c.req.json();
  const { content, mediaUrl, mediaType, replyToId, mentionedUserIds } = body;
  const mentionIds: string[] = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];

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
      mentionedUserIds: JSON.stringify(mentionIds),
    },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true, image: true } } } },
      replyTo: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  // Update conversation updatedAt for list sorting
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  publishDmMessageCreated({
    conversationId,
    message,
  });

  void prisma.conversationParticipant
    .findMany({
      where: { conversationId, userId: { not: user.id } },
      select: { userId: true },
    })
    .then((participants) => {
      publishUserInboxUpdated(
        participants.map((p) => p.userId),
        { kind: "dm", conversationId },
      );
    })
    .catch((err) => console.error("[dms] inbox fanout failed:", err));

  // Fire-and-forget push — never block the message response on Expo
  const senderName = user.name ?? "Someone";
  const msgText = content?.trim() || "📷 Photo";
  const capturedMentionIds = mentionIds;
  void (async () => {
    try {
      const [conversation, senderRecord] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { participants: { select: { userId: true } } },
        }),
        prisma.user.findUnique({ where: { id: user.id }, select: { image: true } }),
      ]);
      if (!conversation) return;

      const otherIds = conversation.participants
        .map((p) => p.userId)
        .filter((id) => id !== user.id);

      const notifTitle = conversation.name ? conversation.name : senderName;
      const notifBody = conversation.name ? `${senderName}: ${msgText}` : msgText;
      const ALENIO_LOGO_URL = `${env.BACKEND_URL}/static/alenio-logo.png`;
      const senderImage = senderRecord?.image ?? ALENIO_LOGO_URL;

      console.log(`[dms] push fanout conversation=${conversationId} recipients=${otherIds.length}`);
      await sendPushToUsers(otherIds, notifTitle, notifBody, { conversationId }, "notifMessages", undefined, senderImage);

      if (capturedMentionIds.length > 0) {
        const participantIds = new Set(conversation.participants.map((p) => p.userId));
        const validMentionIds = capturedMentionIds.filter((id) => id !== user.id && participantIds.has(id));
        if (validMentionIds.length > 0) {
          await sendPushToUsers(
            validMentionIds,
            `${senderName} mentioned you`,
            content?.trim() || "mentioned you in a message",
            { conversationId },
            "notifMessages",
          );
          // Account-level so a mention in a personal DM still reaches Activity
          // for someone who belongs to no workspace.
          await Promise.all(
            validMentionIds.map((mentionedId) =>
              recordAccountActivity({
                userId: mentionedId,
                type: "mention_in_conversation",
                content: `${senderName} mentioned you in ${conversation.name ?? "a conversation"}`,
                metadata: { conversationId },
              }),
            ),
          );
        }
      }
    } catch (err) {
      console.error("[dms] push fanout failed:", err);
    }
  })();

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

  // Enforce 1 reaction per user — swap if different emoji, toggle off if same
  const existingAny = await prisma.directMessageReaction.findFirst({
    where: { directMessageId: messageId, userId: user.id },
  });

  if (existingAny) {
    await prisma.directMessageReaction.delete({ where: { id: existingAny.id } });
    if (existingAny.emoji !== emoji) {
      await prisma.directMessageReaction.create({ data: { directMessageId: messageId, userId: user.id, emoji } });
    }
  } else {
    await prisma.directMessageReaction.create({ data: { directMessageId: messageId, userId: user.id, emoji } });
  }

  const message = await prisma.directMessage.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, name: true, email: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true, image: true } } } },
      replyTo: {
        select: {
          id: true,
          content: true,
          mediaUrl: true,
          mediaType: true,
          sender: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  return c.json({ data: message });
});

// DELETE /api/dms/:conversationId/messages/:messageId
dmsRouter.delete("/:conversationId/messages/:messageId", async (c) => {
  const user = c.get("user")!;
  const { conversationId, messageId } = c.req.param();

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    include: { conversation: { select: { isGroup: true } } },
  });
  if (!participant) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
  if (!message || message.conversationId !== conversationId) {
    return c.json({ error: { message: "Message not found", code: "NOT_FOUND" } }, 404);
  }

  const isOwnMessage = message.senderId === user.id;
  const canModerateGroup =
    participant.conversation.isGroup &&
    (participant.role === "owner" || participant.role === "admin");
  if (!isOwnMessage && !canModerateGroup) {
    return c.json({ error: { message: "Cannot delete someone else's message", code: "FORBIDDEN" } }, 403);
  }

  const pinCleared = await prisma.conversationPin.deleteMany({
    where: { conversationId, directMessageId: messageId },
  });

  await prisma.directMessage.delete({ where: { id: messageId } });
  await deleteStorageObjectByUrlIfOwned(message.mediaUrl);
  if (pinCleared.count > 0) {
    const pins = await prisma.conversationPin.findMany({
      where: { conversationId },
      orderBy: [{ sortOrder: "asc" }, { pinnedAt: "asc" }],
      include: {
        directMessage: {
          select: {
            id: true,
            content: true,
            mediaUrl: true,
            mediaType: true,
            sender: { select: { id: true, name: true, image: true } },
          },
        },
        pinnedBy: { select: { id: true, name: true, image: true } },
      },
      take: MAX_CHAT_PINS,
    });
    publishDmPinUpdated({
      conversationId,
      pinnedMessages: pins.map((pin) => ({
        messageId: pin.directMessage.id,
        content: pin.directMessage.content,
        mediaUrl: pin.directMessage.mediaUrl,
        mediaType: pin.directMessage.mediaType,
        sender: pin.directMessage.sender,
        pinnedAt: pin.pinnedAt.toISOString(),
        pinnedBy: pin.pinnedBy,
      })),
    });
  }
  return new Response(null, { status: 204 });
});

// POST /api/dms/:conversationId/members — add people to a group (owner or admin)
dmsRouter.post("/:conversationId/members", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();
  const { participantIds } = await c.req.json<{ participantIds?: string[] }>();

  if (!Array.isArray(participantIds) || participantIds.length < 1) {
    return c.json({ error: { message: "At least one participant is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const actor = await getGroupParticipant(conversationId, user.id);
  if (!actor?.conversation.isGroup) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageGroupMembers(actor.role)) {
    return c.json({ error: { message: "Only group owners and admins can add members", code: "FORBIDDEN" } }, 403);
  }

  const uniqueIds = Array.from(new Set(participantIds.filter((id) => id && id !== user.id)));
  if (uniqueIds.length === 0) {
    return c.json({ error: { message: "No valid participants to add", code: "VALIDATION_ERROR" } }, 400);
  }

  const existing = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((row) => row.userId));
  const toAdd = uniqueIds.filter((id) => !existingIds.has(id));
  if (toAdd.length === 0) {
    return c.json({ error: { message: "Everyone selected is already in the group", code: "VALIDATION_ERROR" } }, 400);
  }

  try {
    // Mirror create-group: the conversation's own scope decides which rule applies.
    if (actor.conversation.teamId) {
      await assertParticipantsShareWorkspaceWithCreator(user.id, toAdd, actor.conversation.teamId);
    } else {
      await assertPersonalGroupParticipantsAllowed(user.id, toAdd);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid group participants.";
    return c.json({ error: { message, code: "VALIDATION_ERROR" } }, 400);
  }

  await prisma.conversationParticipant.createMany({
    data: toAdd.map((userId) => ({
      conversationId,
      userId,
      role: "member" as const,
    })),
    skipDuplicates: true,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });
  if (!conversation) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      participants: formatGroupParticipants(conversation.participants),
      myRole: myGroupRole(conversation.participants, user.id),
    },
  });
});

// DELETE /api/dms/:conversationId/members/:userId — remove someone from a group
dmsRouter.delete("/:conversationId/members/:userId", async (c) => {
  const user = c.get("user")!;
  const { conversationId, userId: targetUserId } = c.req.param();

  const actor = await getGroupParticipant(conversationId, user.id);
  if (!actor?.conversation.isGroup) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageGroupMembers(actor.role)) {
    return c.json({ error: { message: "Only group owners and admins can remove members", code: "FORBIDDEN" } }, 403);
  }

  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!target) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canRemoveGroupParticipant(actor.role, target.role)) {
    return c.json({ error: { message: "You cannot remove this member", code: "FORBIDDEN" } }, 403);
  }

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });
  if (!conversation) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      participants: formatGroupParticipants(conversation.participants),
      myRole: myGroupRole(conversation.participants, user.id),
    },
  });
});

// POST /api/dms/:conversationId/transfer-ownership — promote another member to owner
dmsRouter.post("/:conversationId/transfer-ownership", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();
  const { userId: newOwnerId } = await c.req.json<{ userId?: string }>();

  if (!newOwnerId) {
    return c.json({ error: { message: "userId is required", code: "VALIDATION_ERROR" } }, 400);
  }
  if (newOwnerId === user.id) {
    return c.json({ error: { message: "You are already the owner", code: "VALIDATION_ERROR" } }, 400);
  }

  const actor = await getGroupParticipant(conversationId, user.id);
  if (!actor?.conversation.isGroup) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canTransferGroupOwnership(actor.role)) {
    return c.json({ error: { message: "Only the group owner can transfer ownership", code: "FORBIDDEN" } }, 403);
  }

  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: newOwnerId } },
  });
  if (!target) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (target.role === "owner") {
    return c.json({ error: { message: "Member is already the owner", code: "VALIDATION_ERROR" } }, 400);
  }

  await prisma.$transaction([
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: newOwnerId } },
      data: { role: "owner" },
    }),
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { role: "member" },
    }),
  ]);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });
  if (!conversation) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      participants: formatGroupParticipants(conversation.participants),
      myRole: myGroupRole(conversation.participants, user.id),
    },
  });
});

// PATCH /api/dms/:conversationId/participants/:userId/role — promote or demote group admins
dmsRouter.patch("/:conversationId/participants/:userId/role", async (c) => {
  const user = c.get("user")!;
  const { conversationId, userId: targetUserId } = c.req.param();
  const { role } = await c.req.json<{ role?: ConversationParticipantRole }>();

  if (role !== "admin" && role !== "member") {
    return c.json({ error: { message: "Role must be admin or member", code: "VALIDATION_ERROR" } }, 400);
  }

  const actor = await getGroupParticipant(conversationId, user.id);
  if (!actor?.conversation.isGroup) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageGroupAdmins(actor.role)) {
    return c.json({ error: { message: "Only the group owner can manage admins", code: "FORBIDDEN" } }, 403);
  }

  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!target) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (target.role === "owner") {
    return c.json({ error: { message: "Use transfer ownership instead", code: "VALIDATION_ERROR" } }, 400);
  }
  if (target.role === role) {
    return c.json({ error: { message: `Member is already ${role === "admin" ? "an admin" : "a member"}`, code: "VALIDATION_ERROR" } }, 400);
  }

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
    data: { role },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { user: { select: participantUserSelect } },
      },
    },
  });
  if (!conversation) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      participants: formatGroupParticipants(conversation.participants),
      myRole: myGroupRole(conversation.participants, user.id),
    },
  });
});

// POST /api/dms/:conversationId/leave — leave a conversation (removes self from participants)
dmsRouter.post("/:conversationId/leave", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, isGroup: true, image: true },
  });
  if (!conversation) {
    return c.json({ error: { message: "Conversation not found", code: "NOT_FOUND" } }, 404);
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!participant) return c.json({ error: { message: "Not a participant", code: "FORBIDDEN" } }, 403);

  if (conversation.isGroup && participant.role === "owner") {
    return c.json({
      error: {
        message: "Group owners cannot leave. Transfer ownership to another member first.",
        code: "FORBIDDEN",
      },
    }, 403);
  }

  const remainingBeforeLeave = await prisma.conversationParticipant.count({ where: { conversationId } });
  const isLastParticipant = remainingBeforeLeave <= 1;

  const mediaRows =
    conversation.isGroup && isLastParticipant
      ? await prisma.directMessage.findMany({
          where: { conversationId, mediaUrl: { not: null } },
          select: { mediaUrl: true },
        })
      : [];

  await prisma.$transaction(async (tx) => {
    await tx.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId: user.id } },
    });

    if (conversation.isGroup && isLastParticipant) {
      await tx.directMessageReaction.deleteMany({
        where: { directMessage: { conversationId } },
      });
      await tx.directMessage.deleteMany({ where: { conversationId } });
      await tx.conversationParticipant.deleteMany({ where: { conversationId } });
      await tx.conversation.delete({ where: { id: conversationId } });
      return;
    }

    const remaining = await tx.conversationParticipant.count({ where: { conversationId } });
    if (remaining === 0) {
      await tx.conversation.delete({ where: { id: conversationId } });
    }
  });

  if (conversation.isGroup && isLastParticipant) {
    await deleteOwnedStorageUrls([
      conversation.image,
      ...mediaRows.map((row) => row.mediaUrl),
    ]);
  }

  return new Response(null, { status: 204 });
});

// DELETE /api/dms/:conversationId — delete entire conversation for all participants
dmsRouter.delete("/:conversationId", async (c) => {
  const user = c.get("user")!;
  const { conversationId } = c.req.param();

  const participant = await getGroupParticipant(conversationId, user.id);
  if (!participant) return c.json({ error: { message: "Not a participant", code: "FORBIDDEN" } }, 403);

  if (participant.conversation.isGroup && !canDeleteGroup(participant.role)) {
    return c.json({ error: { message: "Only the group owner can delete the group", code: "FORBIDDEN" } }, 403);
  }

  const mediaRows = await prisma.directMessage.findMany({
    where: { conversationId, mediaUrl: { not: null } },
    select: { mediaUrl: true },
  });
  const urlsToDelete = [
    participant.conversation.image,
    ...mediaRows.map((row) => row.mediaUrl),
  ];

  await prisma.conversation.delete({ where: { id: conversationId } });
  await deleteOwnedStorageUrls(urlsToDelete);
  return new Response(null, { status: 204 });
});

// POST /api/dms/unread-counts - returns unread message counts for DM conversations
dmsRouter.post("/unread-counts", async (c) => {
  const user = c.get("user")!;
  const { lastReadIds } = await c.req.json<{ lastReadIds: Record<string, string> }>();

  const counts: Record<string, number> = {};

  const validLastReadIds = Object.values(lastReadIds).filter((id): id is string => Boolean(id));
  const lastReadMessages = await prisma.directMessage.findMany({
    where: { id: { in: validLastReadIds } },
    select: { id: true, createdAt: true },
  });
  const lastReadMap = Object.fromEntries(lastReadMessages.map((m) => [m.id, m.createdAt]));

  await Promise.all(
    Object.entries(lastReadIds).map(async ([convId, lastReadId]) => {
      const afterDate: Date | null = lastReadId ? (lastReadMap[lastReadId] ?? null) : null;
      counts[convId] = await prisma.directMessage.count({
        where: {
          conversationId: convId,
          senderId: { not: user.id },
          ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
        },
      });
    })
  );

  return c.json({ data: counts });
});

export { dmsRouter };
