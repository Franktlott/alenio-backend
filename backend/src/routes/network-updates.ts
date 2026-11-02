import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { parseOwnedStorageObjectFromUrl } from "../lib/firebase-storage";
import {
  canAccessNetworkPost,
  isOwnedGenericUploadPath,
  isValidReactionEmoji,
  visibleNetworkAuthorCutoffs,
} from "../lib/network-updates-policy";
import { buildConnectionPairKey } from "../lib/messaging-permission";
import { isBlockedEitherDirection } from "../lib/relationship-blocks";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const networkUpdatesRouter = new Hono<{ Variables: Variables }>();
networkUpdatesRouter.use("*", authGuard);

const NETWORK_POST_TYPE = "network_post";
const POST_BODY_MAX = 2_000;
const COMMENT_BODY_MAX = 1_000;
const IMAGE_DIMENSION_MAX = 20_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const reactionUserSelect = { id: true, name: true } as const;
const activityInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: reactionUserSelect } } },
  _count: { select: { comments: true } },
} as const;
const commentInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: reactionUserSelect } } },
} as const;

type ReactionRow = {
  emoji: string;
  userId: string;
  user: { id: string; name: string };
};

function mapReactions(reactions: ReactionRow[]) {
  return reactions.reduce(
    (
      result: Record<
        string,
        { count: number; userIds: string[]; users: { id: string; name: string }[] }
      >,
      reaction,
    ) => {
      if (!result[reaction.emoji]) {
        result[reaction.emoji] = { count: 0, userIds: [], users: [] };
      }
      result[reaction.emoji]!.count += 1;
      result[reaction.emoji]!.userIds.push(reaction.userId);
      result[reaction.emoji]!.users.push(reaction.user);
      return result;
    },
    {},
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function serializeActivity(activity: {
  id: string;
  teamId: string | null;
  type: string;
  metadata: string | null;
  createdAt: Date;
  userId: string | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: ReactionRow[];
  _count: { comments: number };
}, viewerId: string) {
  return {
    id: activity.id,
    teamId: activity.teamId,
    type: activity.type,
    createdAt: activity.createdAt.toISOString(),
    metadata: parseMetadata(activity.metadata),
    user: activity.user,
    reactions: mapReactions(activity.reactions),
    commentCount: activity._count.comments,
    canDelete: activity.userId === viewerId,
  };
}

function serializeComment(comment: {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  parentId: string | null;
  user: { id: string; name: string; image: string | null };
  reactions: ReactionRow[];
}, viewerId: string) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    parentId: comment.parentId,
    author: comment.user,
    canDelete: comment.userId === viewerId,
    reactions: mapReactions(comment.reactions),
  };
}

async function currentVisibleAuthorCutoffs(viewerId: string) {
  const [connections, blocks] = await Promise.all([
    prisma.connection.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: viewerId }, { recipientId: viewerId }],
      },
      select: {
        requesterId: true,
        recipientId: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  return visibleNetworkAuthorCutoffs(viewerId, connections, blocks);
}

async function loadAccessiblePost(viewerId: string, activityId: string) {
  const activity = await prisma.teamActivity.findFirst({
    where: { id: activityId, teamId: null, type: NETWORK_POST_TYPE },
    include: activityInclude,
  });
  if (!activity) return null;
  if (activity.userId === viewerId) return activity;
  if (!activity.userId) return null;

  const [connection, blocked] = await Promise.all([
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(viewerId, activity.userId) },
      select: { status: true, updatedAt: true },
    }),
    isBlockedEitherDirection(viewerId, activity.userId),
  ]);
  const authorCutoffs =
    connection?.status === "accepted" && !blocked
      ? [{ authorId: activity.userId, visibleFrom: connection.updatedAt }]
      : [];
  return canAccessNetworkPost(
    viewerId,
    activity.userId,
    activity.createdAt,
    authorCutoffs,
  )
    ? activity
    : null;
}

function notFound(c: { json: (body: unknown, status: 404) => Response }, resource: string) {
  return c.json({ error: { message: `${resource} not found`, code: "NOT_FOUND" } }, 404);
}

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(200).optional(),
});

type FeedCursor = { createdAt: string; id: string };

function encodeCursor(value: FeedCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): FeedCursor | null | undefined {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as FeedCursor;
    const date = new Date(parsed.createdAt);
    if (!parsed.id || !Number.isFinite(date.getTime())) return undefined;
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    return undefined;
  }
}

networkUpdatesRouter.get(
  "/",
  zValidator("query", feedQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const { limit = DEFAULT_PAGE_SIZE, cursor: rawCursor } = c.req.valid("query");
    const cursor = decodeCursor(rawCursor);
    if (cursor === undefined) {
      return c.json(
        { error: { message: "Invalid feed cursor", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    const authorCutoffs = await currentVisibleAuthorCutoffs(user.id);
    const cursorDate = cursor ? new Date(cursor.createdAt) : null;
    const activities = await prisma.teamActivity.findMany({
      where: {
        teamId: null,
        type: NETWORK_POST_TYPE,
        AND: [
          {
            OR: [
              { userId: user.id },
              ...authorCutoffs.map(({ authorId, visibleFrom }) => ({
                userId: authorId,
                createdAt: { gte: visibleFrom },
              })),
            ],
          },
          ...(cursorDate
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursorDate } },
                    { createdAt: cursorDate, id: { lt: cursor!.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: activityInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = activities.length > limit;
    const page = activities.slice(0, limit);
    const last = page.at(-1);
    return c.json({
      data: {
        items: page.map((activity) => serializeActivity(activity, user.id)),
        nextCursor:
          hasMore && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      },
    });
  },
);

const createPostSchema = z
  .object({
    body: z.string().trim().max(POST_BODY_MAX).optional(),
    imageUrl: z.string().url().max(2_048).optional(),
    imageWidth: z.number().int().min(1).max(IMAGE_DIMENSION_MAX).optional(),
    imageHeight: z.number().int().min(1).max(IMAGE_DIMENSION_MAX).optional(),
  })
  .superRefine((value, context) => {
    if (!value.body && !value.imageUrl) {
      context.addIssue({ code: "custom", message: "Add a message or a photo" });
    }
    if (!!value.imageWidth !== !!value.imageHeight) {
      context.addIssue({
        code: "custom",
        message: "Image width and height must be provided together",
      });
    }
    if (!value.imageUrl && (value.imageWidth || value.imageHeight)) {
      context.addIssue({ code: "custom", message: "Image dimensions require a photo" });
    }
  });

networkUpdatesRouter.post(
  "/",
  zValidator("json", createPostSchema),
  async (c) => {
    const user = c.get("user")!;
    const { body, imageUrl, imageWidth, imageHeight } = c.req.valid("json");
    if (imageUrl) {
      const object = parseOwnedStorageObjectFromUrl(imageUrl);
      if (!object || !isOwnedGenericUploadPath(user.id, object.objectPath)) {
        return c.json(
          {
            error: {
              message: "Upload the photo before adding it.",
              code: "VALIDATION_ERROR",
            },
          },
          400,
        );
      }
    }

    const activity = await prisma.teamActivity.create({
      data: {
        teamId: null,
        userId: user.id,
        type: NETWORK_POST_TYPE,
        metadata: JSON.stringify({
          body: body || null,
          imageUrl: imageUrl ?? null,
          imageWidth: imageWidth ?? null,
          imageHeight: imageHeight ?? null,
        }),
      },
      include: activityInclude,
    });
    return c.json({ data: serializeActivity(activity, user.id) }, 201);
  },
);

networkUpdatesRouter.get("/:activityId", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
  if (!activity) return notFound(c, "Network update");
  return c.json({ data: serializeActivity(activity, user.id) });
});

networkUpdatesRouter.delete("/:activityId", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
  if (!activity || activity.userId !== user.id) return notFound(c, "Network update");

  await prisma.teamActivity.delete({ where: { id: activity.id } });
  return c.body(null, 204);
});

const reactionSchema = z.object({
  emoji: z.string().refine(isValidReactionEmoji, "Choose one emoji"),
});

networkUpdatesRouter.post(
  "/:activityId/react",
  zValidator("json", reactionSchema),
  async (c) => {
    const user = c.get("user")!;
    const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
    if (!activity) return notFound(c, "Network update");
    const { emoji } = c.req.valid("json");

    const existing = await prisma.teamActivityReaction.findFirst({
      where: { activityId: activity.id, userId: user.id },
    });
    if (existing) {
      await prisma.teamActivityReaction.delete({ where: { id: existing.id } });
      if (existing.emoji === emoji) {
        return c.json({ data: { toggled: false } });
      }
    }
    await prisma.teamActivityReaction.create({
      data: { activityId: activity.id, userId: user.id, emoji },
    });
    return c.json({ data: { toggled: true } });
  },
);

networkUpdatesRouter.get("/:activityId/comments", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
  if (!activity) return notFound(c, "Network update");

  const comments = await prisma.teamActivityComment.findMany({
    where: { activityId: activity.id },
    include: commentInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 400,
  });
  return c.json({
    data: comments.map((comment) => serializeComment(comment, user.id)),
  });
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.string().min(1).optional(),
});

networkUpdatesRouter.post(
  "/:activityId/comments",
  zValidator("json", createCommentSchema),
  async (c) => {
    const user = c.get("user")!;
    const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
    if (!activity) return notFound(c, "Network update");
    const { body, parentId } = c.req.valid("json");

    let resolvedParentId: string | null = null;
    if (parentId) {
      const parent = await prisma.teamActivityComment.findUnique({
        where: { id: parentId },
        select: { id: true, activityId: true, parentId: true },
      });
      if (!parent || parent.activityId !== activity.id) return notFound(c, "Comment");
      resolvedParentId = parent.parentId ?? parent.id;
    }

    const comment = await prisma.teamActivityComment.create({
      data: {
        activityId: activity.id,
        userId: user.id,
        body,
        parentId: resolvedParentId,
      },
      include: commentInclude,
    });
    return c.json({ data: serializeComment(comment, user.id) }, 201);
  },
);

networkUpdatesRouter.delete("/:activityId/comments/:commentId", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAccessiblePost(user.id, c.req.param("activityId"));
  if (!activity) return notFound(c, "Network update");

  const comment = await prisma.teamActivityComment.findFirst({
    where: {
      id: c.req.param("commentId"),
      activityId: activity.id,
      userId: user.id,
    },
    select: { id: true },
  });
  if (!comment) return notFound(c, "Comment");
  await prisma.teamActivityComment.delete({ where: { id: comment.id } });
  return c.body(null, 204);
});

export { networkUpdatesRouter };

