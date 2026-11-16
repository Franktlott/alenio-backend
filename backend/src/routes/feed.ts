import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { isValidReactionEmoji } from "../lib/network-updates-policy";
import {
  ALENIO_POST_TYPE,
  decodePersonalFeedCursor,
  getPersonalFeedPage,
  personalFeedActivityInclude,
  serializePersonalFeedItem,
} from "../lib/personal-feed";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const feedRouter = new Hono<{ Variables: Variables }>();
feedRouter.use("*", authGuard);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const COMMENT_BODY_MAX = 1_000;

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(200).optional(),
});

const reactionSchema = z.object({
  emoji: z.string().refine(isValidReactionEmoji, "Choose one emoji"),
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.string().min(1).optional(),
});

async function loadAlenioPost(activityId: string) {
  return prisma.teamActivity.findFirst({
    where: {
      id: activityId,
      type: ALENIO_POST_TYPE,
      OR: [{ audienceKind: "alenio" }, { audienceKind: null, teamId: null }],
    },
    include: personalFeedActivityInclude,
  });
}

feedRouter.get("/", zValidator("query", feedQuerySchema), async (c) => {
  const user = c.get("user")!;
  const { limit = DEFAULT_PAGE_SIZE, cursor: rawCursor } = c.req.valid("query");
  const cursor = decodePersonalFeedCursor(rawCursor);
  if (cursor === undefined) {
    return c.json(
      { error: { message: "Invalid feed cursor", code: "VALIDATION_ERROR" } },
      400,
    );
  }

  const page = await getPersonalFeedPage(prisma, user.id, {
    limit,
    cursor,
  });

  return c.json({ data: page });
});

feedRouter.get("/:activityId", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAlenioPost(c.req.param("activityId"));
  if (!activity) {
    return c.json(
      { error: { message: "Alenio post not found", code: "NOT_FOUND" } },
      404,
    );
  }
  return c.json({ data: serializePersonalFeedItem(activity, user.id) });
});

feedRouter.post(
  "/:activityId/react",
  zValidator("json", reactionSchema),
  async (c) => {
    const user = c.get("user")!;
    const activity = await loadAlenioPost(c.req.param("activityId"));
    if (!activity) {
      return c.json(
        { error: { message: "Alenio post not found", code: "NOT_FOUND" } },
        404,
      );
    }
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

feedRouter.get("/:activityId/comments", async (c) => {
  const user = c.get("user")!;
  const activity = await loadAlenioPost(c.req.param("activityId"));
  if (!activity) {
    return c.json(
      { error: { message: "Alenio post not found", code: "NOT_FOUND" } },
      404,
    );
  }
  const comments = await prisma.teamActivityComment.findMany({
    where: { activityId: activity.id },
    include: {
      user: { select: { id: true, name: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 400,
  });
  return c.json({
    data: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      parentId: comment.parentId,
      author: comment.user,
      canDelete: comment.userId === user.id,
      reactions: comment.reactions.reduce(
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
      ),
    })),
  });
});

feedRouter.post(
  "/:activityId/comments",
  zValidator("json", createCommentSchema),
  async (c) => {
    const user = c.get("user")!;
    const activity = await loadAlenioPost(c.req.param("activityId"));
    if (!activity) {
      return c.json(
        { error: { message: "Alenio post not found", code: "NOT_FOUND" } },
        404,
      );
    }
    if (activity.commentsLocked) {
      return c.json(
        {
          error: {
            message: "Comments are locked for this post",
            code: "COMMENTS_LOCKED",
          },
        },
        403,
      );
    }
    const { body, parentId } = c.req.valid("json");
    if (parentId) {
      const parent = await prisma.teamActivityComment.findFirst({
        where: { id: parentId, activityId: activity.id },
        select: { id: true },
      });
      if (!parent) {
        return c.json(
          { error: { message: "Parent comment not found", code: "NOT_FOUND" } },
          404,
        );
      }
    }
    const comment = await prisma.teamActivityComment.create({
      data: {
        activityId: activity.id,
        userId: user.id,
        body,
        parentId: parentId ?? null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return c.json(
      {
        data: {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          parentId: comment.parentId,
          author: comment.user,
          canDelete: true,
          reactions: {},
        },
      },
      201,
    );
  },
);

export { feedRouter };
