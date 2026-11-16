import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { alenioAudienceFields } from "../lib/activity-audience";
import { isHttpsUrl } from "../lib/discover-document";
import { isValidReactionEmoji } from "../lib/network-updates-policy";
import {
  ALENIO_POST_TYPE,
  personalFeedActivityInclude,
  serializePersonalFeedItem,
} from "../lib/personal-feed";
import {
  adminGuard,
  auditStaffChanges,
  requireAbilityByMethod,
} from "../middleware/admin-guard";
import { prisma } from "../prisma";
import type { AdminFeedComment } from "../types";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const POST_BODY_MAX = 2_000;
const COMMENT_BODY_MAX = 1_000;
const IMAGE_DIMENSION_MAX = 20_000;

const optionalImage = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .refine(
    (value) =>
      value == null ||
      value === "" ||
      isHttpsUrl(value) ||
      value.startsWith("http://localhost") ||
      value.startsWith("http://127.0.0.1"),
    "Image must be an https URL",
  );

const createBody = z
  .object({
    body: z.string().trim().max(POST_BODY_MAX).optional(),
    imageUrl: optionalImage,
    imageWidth: z.number().int().min(1).max(IMAGE_DIMENSION_MAX).optional(),
    imageHeight: z.number().int().min(1).max(IMAGE_DIMENSION_MAX).optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    commentsLocked: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const body = value.body?.trim() ?? "";
    const imageUrl = value.imageUrl?.trim() ?? "";
    if (!body && !imageUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add text or an image for this Alenio post.",
        path: ["body"],
      });
    }
    if (!imageUrl && (value.imageWidth || value.imageHeight || value.mediaType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image size and media type require an image URL.",
        path: ["imageUrl"],
      });
    }
  });

const updateCommentsBody = z.object({
  commentsLocked: z.boolean(),
});

const createCommentBody = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.string().min(1).optional(),
});

const reactToCommentBody = z.object({
  emoji: z.string().refine(isValidReactionEmoji, "Choose one emoji"),
});

const commentInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: { id: true, name: true } } } },
} as const;

function serializeAdminFeedComment(
  comment: {
    id: string;
    body: string;
    createdAt: Date;
    parentId: string | null;
    user: { id: string; name: string; image: string | null };
    reactions: Array<{
      emoji: string;
      userId: string;
      user: { id: string; name: string };
    }>;
  },
): AdminFeedComment {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    parentId: comment.parentId,
    author: comment.user,
    canDelete: true,
    reactions: comment.reactions.reduce<AdminFeedComment["reactions"]>(
      (result, reaction) => {
        result[reaction.emoji] ??= { count: 0, userIds: [], users: [] };
        result[reaction.emoji]!.count += 1;
        result[reaction.emoji]!.userIds.push(reaction.userId);
        result[reaction.emoji]!.users.push(reaction.user);
        return result;
      },
      {},
    ),
  };
}

async function loadAdminAlenioPost(activityId: string) {
  return prisma.teamActivity.findFirst({
    where: {
      id: activityId,
      type: ALENIO_POST_TYPE,
      OR: [{ audienceKind: "alenio" }, { audienceKind: null, teamId: null }],
    },
    select: { id: true, commentsLocked: true },
  });
}

function bad(
  c: { json: (body: unknown, status?: number) => Response },
  message: string,
  status = 400,
) {
  return c.json({ error: { message } }, status);
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the post fields and try again.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function describeFeedPostChange(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  const id = parts.at(-1) ?? null;
  const isCommentPath = parts.includes("comments");
  if (isCommentPath && method === "DELETE") {
    return {
      action: "feed_post.comment.delete",
      summary: "Moderated an Alenio feed comment",
      targetId: id,
    };
  }
  if (isCommentPath && method === "POST" && parts.at(-1) === "react") {
    return {
      action: "feed_post.comment.react",
      summary: "Reacted to an Alenio feed comment",
      targetId: parts.at(-2) ?? null,
    };
  }
  if (isCommentPath && method === "POST") {
    return {
      action: "feed_post.comment.create",
      summary: "Commented on an Alenio feed post",
      targetId: parts.at(-2) ?? null,
    };
  }
  if (isCommentPath) {
    return {
      action: "feed_post.comment.view",
      summary: "Reviewed Alenio feed comments",
      targetId: parts.at(-2) ?? null,
    };
  }
  if (method === "DELETE") {
    return {
      action: "feed_post.delete",
      summary: "Deleted an Alenio feed post",
      targetId: id,
    };
  }
  if (method === "POST") {
    return { action: "feed_post.create", summary: "Published an Alenio feed post" };
  }
  if (method === "PATCH") {
    return {
      action: "feed_post.comments.update",
      summary: "Changed comments on an Alenio feed post",
      targetId: id,
    };
  }
  return { action: "feed_post.view", summary: "Viewed Alenio feed posts" };
}

export const adminFeedPostsRouter = new Hono<{ Variables: Variables }>();

adminFeedPostsRouter.use("*", adminGuard);
adminFeedPostsRouter.use("*", requireAbilityByMethod("content.view", "content.edit"));
adminFeedPostsRouter.use("*", auditStaffChanges("feed_post", describeFeedPostChange));

adminFeedPostsRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await prisma.teamActivity.findMany({
    where: {
      type: ALENIO_POST_TYPE,
      OR: [{ audienceKind: "alenio" }, { audienceKind: null, teamId: null }],
    },
    include: personalFeedActivityInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return c.json({
    data: {
      items: rows.map((row) => serializePersonalFeedItem(row, user.id)),
    },
  });
});

adminFeedPostsRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));

  const body = parsed.data.body?.trim() || "";
  const imageUrl = parsed.data.imageUrl?.trim() || null;
  const created = await prisma.teamActivity.create({
    data: {
      teamId: null,
      userId: user.id,
      type: ALENIO_POST_TYPE,
      ...alenioAudienceFields(),
      commentsLocked: parsed.data.commentsLocked ?? false,
      metadata: JSON.stringify({
        body: body || null,
        imageUrl,
        imageWidth: imageUrl ? (parsed.data.imageWidth ?? null) : null,
        imageHeight: imageUrl ? (parsed.data.imageHeight ?? null) : null,
        mediaType: imageUrl ? (parsed.data.mediaType ?? "image") : null,
        authorLabel: "Alenio",
      }),
    },
    include: personalFeedActivityInclude,
  });

  return c.json(
    { data: serializePersonalFeedItem(created, user.id) },
    201,
  );
});

adminFeedPostsRouter.patch("/:activityId", async (c) => {
  const activityId = c.req.param("activityId");
  const parsed = updateCommentsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));

  const existing = await prisma.teamActivity.findFirst({
    where: {
      id: activityId,
      type: ALENIO_POST_TYPE,
      OR: [{ audienceKind: "alenio" }, { audienceKind: null, teamId: null }],
    },
    select: { id: true },
  });
  if (!existing) return bad(c, "Alenio post not found.", 404);

  const updated = await prisma.teamActivity.update({
    where: { id: existing.id },
    data: { commentsLocked: parsed.data.commentsLocked },
    include: personalFeedActivityInclude,
  });
  const user = c.get("user")!;
  return c.json({ data: serializePersonalFeedItem(updated, user.id) });
});

adminFeedPostsRouter.get("/:activityId/comments", async (c) => {
  const activity = await loadAdminAlenioPost(c.req.param("activityId"));
  if (!activity) return bad(c, "Alenio post not found.", 404);

  const comments = await prisma.teamActivityComment.findMany({
    where: { activityId: activity.id },
    include: commentInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 400,
  });
  return c.json({
    data: { items: comments.map(serializeAdminFeedComment) },
  });
});

adminFeedPostsRouter.post("/:activityId/comments", async (c) => {
  const activity = await loadAdminAlenioPost(c.req.param("activityId"));
  if (!activity) return bad(c, "Alenio post not found.", 404);
  if (activity.commentsLocked) {
    return c.json(
      {
        error: {
          message: "Comments are locked for this post.",
          code: "COMMENTS_LOCKED",
        },
      },
      403,
    );
  }

  const parsed = createCommentBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, zodMessage(parsed.error));

  let resolvedParentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.teamActivityComment.findFirst({
      where: { id: parsed.data.parentId, activityId: activity.id },
      select: { id: true, parentId: true },
    });
    if (!parent) return bad(c, "Parent comment not found.", 404);
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const user = c.get("user")!;
  const comment = await prisma.teamActivityComment.create({
    data: {
      activityId: activity.id,
      userId: user.id,
      body: parsed.data.body,
      parentId: resolvedParentId,
    },
    include: commentInclude,
  });
  return c.json({ data: serializeAdminFeedComment(comment) }, 201);
});

adminFeedPostsRouter.post(
  "/:activityId/comments/:commentId/react",
  async (c) => {
    const activity = await loadAdminAlenioPost(c.req.param("activityId"));
    if (!activity) return bad(c, "Alenio post not found.", 404);

    const commentId = c.req.param("commentId");
    const existingComment = await prisma.teamActivityComment.findFirst({
      where: { id: commentId, activityId: activity.id },
      select: { id: true },
    });
    if (!existingComment) return bad(c, "Comment not found.", 404);

    const parsed = reactToCommentBody.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return bad(c, zodMessage(parsed.error));

    const user = c.get("user")!;
    const existing = await prisma.teamActivityCommentReaction.findUnique({
      where: {
        commentId_userId_emoji: {
          commentId,
          userId: user.id,
          emoji: parsed.data.emoji,
        },
      },
    });
    if (existing) {
      await prisma.teamActivityCommentReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await prisma.teamActivityCommentReaction.deleteMany({
        where: { commentId, userId: user.id },
      });
      await prisma.teamActivityCommentReaction.create({
        data: { commentId, userId: user.id, emoji: parsed.data.emoji },
      });
    }

    const updated = await prisma.teamActivityComment.findUnique({
      where: { id: commentId },
      include: commentInclude,
    });
    return c.json({
      data: updated ? serializeAdminFeedComment(updated) : null,
    });
  },
);

adminFeedPostsRouter.delete(
  "/:activityId/comments/:commentId",
  async (c) => {
    const activity = await loadAdminAlenioPost(c.req.param("activityId"));
    if (!activity) return bad(c, "Alenio post not found.", 404);

    const comment = await prisma.teamActivityComment.findFirst({
      where: {
        id: c.req.param("commentId"),
        activityId: activity.id,
      },
      select: { id: true },
    });
    if (!comment) return bad(c, "Comment not found.", 404);

    await prisma.teamActivityComment.delete({ where: { id: comment.id } });
    return c.json({ data: { ok: true } });
  },
);

adminFeedPostsRouter.delete("/:activityId", async (c) => {
  const activityId = c.req.param("activityId");
  const existing = await prisma.teamActivity.findFirst({
    where: {
      id: activityId,
      type: ALENIO_POST_TYPE,
      OR: [{ audienceKind: "alenio" }, { audienceKind: null, teamId: null }],
    },
    select: { id: true },
  });
  if (!existing) return bad(c, "Alenio post not found.", 404);

  await prisma.teamActivity.delete({ where: { id: existing.id } });
  return c.json({ data: { ok: true } });
});
