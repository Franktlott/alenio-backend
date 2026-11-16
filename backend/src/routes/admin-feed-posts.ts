import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { alenioAudienceFields } from "../lib/activity-audience";
import { isHttpsUrl } from "../lib/discover-document";
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

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const POST_BODY_MAX = 2_000;
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
  const id = path.split("/").filter(Boolean).pop() ?? null;
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
