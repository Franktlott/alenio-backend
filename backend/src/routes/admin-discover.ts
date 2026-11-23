import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "../auth";
import {
  isHttpsUrl,
  readingTimeMinutes,
  sanitizeDiscoverDoc,
  slugifyDiscoverTitle,
  type DiscoverStatus,
} from "../lib/discover-document";
import { toAdminArticle, toCategoryJson } from "../lib/discover-serialize";
import { discoverArticleIsLive, liveArticleWhere, resolvePublication } from "../lib/discover-visibility";
import { adminGuard, auditStaffChanges, requireAbilityByMethod } from "../middleware/admin-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const articleInclude = {
  category: true,
  lastPublishedBy: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.DiscoverArticleInclude;

const optionalHttps = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .refine((value) => value == null || value === "" || isHttpsUrl(value), "Image address must start with https://");

const articleBody = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(96).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.unknown().optional(),
  categoryId: z.string().nullable().optional(),
  coverImageUrl: optionalHttps,
  coverImageAlt: z.string().max(200).nullable().optional(),
  status: z.enum(["draft", "scheduled", "published", "unpublished", "archived"]),
  isFeatured: z.boolean().optional(),
  featuredInCategory: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  senecaEnabled: z.boolean().optional(),
  senecaPrompt: z.string().max(1000).optional(),
  senecaContext: z.string().max(4000).optional(),
  authorName: z.string().trim().max(80).optional(),
  publishedAt: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
});

const categoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(300).optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

async function uniqueArticleSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = slugifyDiscoverTitle(base);
  let suffix = 2;
  while (suffix < 60) {
    const existing = await prisma.discoverArticle.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${slugifyDiscoverTitle(base).slice(0, 72)}-${suffix}`;
    suffix += 1;
  }
  return `${slugifyDiscoverTitle(base).slice(0, 60)}-${Date.now()}`;
}

async function uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  let candidate = slugifyDiscoverTitle(base);
  let suffix = 2;
  while (suffix < 40) {
    const existing = await prisma.discoverCategory.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${slugifyDiscoverTitle(base).slice(0, 72)}-${suffix}`;
    suffix += 1;
  }
  return `${slugifyDiscoverTitle(base).slice(0, 60)}-${Date.now()}`;
}

function bad(c: { json: (data: unknown, status?: number) => Response }, message: string, status = 400) {
  return c.json({ error: { message, code: status === 404 ? "NOT_FOUND" : "VALIDATION" } }, status);
}

function describeDiscoverChange(method: string, path: string) {
  const tail = path.replace(/^.*\/api\/admin\/discover/, "");
  const id = /\/(?:articles|categories)\/([^/]+)/.exec(tail)?.[1] ?? null;
  const onCategory = tail.startsWith("/categories");
  if (onCategory) {
    if (tail === "/categories/reorder") return { action: "category.reorder", summary: "Reordered Discover categories" };
    if (method === "POST") return { action: "category.create", summary: "Created a Discover category" };
    return { action: "category.edit", summary: "Edited a Discover category", targetId: id };
  }
  if (tail.endsWith("/duplicate")) return { action: "article.duplicate", summary: "Duplicated a Discover article", targetId: id };
  if (tail.endsWith("/draft/publish")) return { action: "article.publish_changes", summary: "Published changes to a Discover article", targetId: id };
  if (tail.endsWith("/draft") && method === "DELETE") return { action: "article.discard_changes", summary: "Discarded draft changes to a Discover article", targetId: id };
  if (tail.endsWith("/draft")) return { action: "article.save_changes", summary: "Saved draft changes to a Discover article", targetId: id };
  if (tail.endsWith("/unpublish")) return { action: "article.unpublish", summary: "Unpublished a Discover article", targetId: id };
  if (method === "DELETE") return { action: "article.delete", summary: "Deleted a Discover article", targetId: id };
  if (method === "POST") return { action: "article.create", summary: "Created a Discover article" };
  return { action: "article.edit", summary: "Saved a Discover article", targetId: id };
}

export const adminDiscoverRouter = new Hono<{ Variables: Variables }>();

adminDiscoverRouter.use("*", adminGuard);
adminDiscoverRouter.use("*", requireAbilityByMethod("content.view", "content.edit"));
adminDiscoverRouter.use("*", auditStaffChanges("article", describeDiscoverChange));

adminDiscoverRouter.get("/metrics", async (c) => {
  const now = new Date();
  const [published, drafts, scheduled, featured, views] = await Promise.all([
    prisma.discoverArticle.count({ where: liveArticleWhere(now) }),
    prisma.discoverArticle.count({ where: { status: { in: ["draft", "unpublished"] } } }),
    prisma.discoverArticle.count({ where: { status: "scheduled", scheduledAt: { gt: now } } }),
    prisma.discoverArticle.count({ where: { isFeatured: true, status: { not: "archived" } } }),
    prisma.discoverArticle.aggregate({ _sum: { viewCount: true } }),
  ]);
  return c.json({
    data: {
      published,
      drafts,
      scheduled,
      featured,
      views: views._sum.viewCount ?? 0,
    },
  });
});

adminDiscoverRouter.get("/articles", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const status = c.req.query("status")?.trim() ?? "";
  const categoryId = c.req.query("categoryId")?.trim() ?? "";
  const sort = c.req.query("sort") === "publishedAt" ? "publishedAt" : "updatedAt";
  const page = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query("pageSize")) || 20)));
  const where: Prisma.DiscoverArticleWhereInput = {};
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (
    status === "draft" ||
    status === "scheduled" ||
    status === "published" ||
    status === "unpublished" ||
    status === "archived"
  ) {
    where.status = status;
  }
  if (categoryId) where.categoryId = categoryId;
  const [total, rows] = await Promise.all([
    prisma.discoverArticle.count({ where }),
    prisma.discoverArticle.findMany({
      where,
      include: articleInclude,
      orderBy: sort === "publishedAt" ? { publishedAt: "desc" } : { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const now = new Date();
  return c.json({
    data: {
      items: rows.map((row) => ({ ...toAdminArticle(row), isLive: discoverArticleIsLive(row, now) })),
      total,
      page,
      pageSize,
    },
  });
});

adminDiscoverRouter.get("/articles/:id", async (c) => {
  const article = await prisma.discoverArticle.findUnique({
    where: { id: c.req.param("id") },
    include: articleInclude,
  });
  if (!article) return bad(c, "Article not found", 404);
  return c.json({ data: { ...toAdminArticle(article), isLive: discoverArticleIsLive(article, new Date()) } });
});

adminDiscoverRouter.post("/articles", async (c) => {
  const parsed = articleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the article fields and try again.");
  const user = c.get("user");
  const saved = await saveArticle(parsed.data, user?.id ?? null, null);
  if (!saved.ok) return bad(c, saved.message);
  return c.json({ data: saved.article }, 201);
});

adminDiscoverRouter.patch("/articles/:id", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Article not found", 404);
  if (discoverArticleIsLive(existing, new Date())) {
    return c.json(
      { error: { message: "This article is live. Save your edits as draft changes, then publish them.", code: "ARTICLE_LIVE" } },
      409,
    );
  }
  const parsed = articleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the article fields and try again.");
  const user = c.get("user");
  const saved = await saveArticle(parsed.data, user?.id ?? null, existing.id);
  if (!saved.ok) return bad(c, saved.message);
  return c.json({ data: saved.article });
});

/** Live articles are never edited in place: edits wait in `pendingDraft` until published. */
adminDiscoverRouter.put("/articles/:id/draft", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Article not found", 404);
  if (!discoverArticleIsLive(existing, new Date())) return bad(c, "Only live articles keep draft changes.");
  const parsed = articleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the article fields and try again.");
  const user = c.get("user");
  const { status: _status, publishedAt: _publishedAt, scheduledAt: _scheduledAt, ...fields } = parsed.data;
  const article = await prisma.discoverArticle.update({
    where: { id: existing.id },
    data: {
      pendingDraft: { ...fields, content: sanitizeDiscoverDoc(fields.content) } as Prisma.InputJsonValue,
      pendingDraftAt: new Date(),
      pendingDraftById: user?.id ?? null,
    },
    include: articleInclude,
  });
  return c.json({ data: { ...toAdminArticle(article), isLive: true } });
});

adminDiscoverRouter.post("/articles/:id/draft/publish", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Article not found", 404);
  if (!discoverArticleIsLive(existing, new Date())) return bad(c, "This article is not live.");
  const draft = draftInput(existing, existing.status);
  if (!draft) return bad(c, "There are no draft changes to publish.");
  const user = c.get("user");
  const saved = await saveArticle(draft, user?.id ?? null, existing.id, {
    ...CLEAR_DRAFT,
    lastPublishedAt: new Date(),
    lastPublishedById: user?.id ?? null,
  });
  if (!saved.ok) return bad(c, saved.message);
  return c.json({ data: { ...saved.article, isLive: true } });
});

adminDiscoverRouter.delete("/articles/:id/draft", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") }, select: { id: true } });
  if (!existing) return bad(c, "Article not found", 404);
  const article = await prisma.discoverArticle.update({
    where: { id: existing.id },
    data: CLEAR_DRAFT,
    include: articleInclude,
  });
  return c.json({ data: { ...toAdminArticle(article), isLive: discoverArticleIsLive(article, new Date()) } });
});

adminDiscoverRouter.post("/articles/:id/duplicate", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({
    where: { id: c.req.param("id") },
    include: articleInclude,
  });
  if (!existing) return bad(c, "Article not found", 404);
  const user = c.get("user");
  const slug = await uniqueArticleSlug(`${existing.slug}-copy`);
  const copy = await prisma.discoverArticle.create({
    data: {
      title: `${existing.title} copy`.slice(0, 200),
      slug,
      excerpt: existing.excerpt,
      content: sanitizeDiscoverDoc(existing.content) as Prisma.InputJsonValue,
      categoryId: existing.categoryId,
      coverImageUrl: existing.coverImageUrl,
      coverImageAlt: existing.coverImageAlt,
      status: "draft",
      isFeatured: false,
      featuredInCategory: false,
      displayOrder: existing.displayOrder,
      readingTimeMinutes: existing.readingTimeMinutes,
      senecaEnabled: existing.senecaEnabled,
      senecaPrompt: existing.senecaPrompt,
      senecaContext: existing.senecaContext,
      authorName: existing.authorName,
      publishedAt: null,
      scheduledAt: null,
      viewCount: 0,
      createdById: user?.id ?? null,
      updatedById: user?.id ?? null,
    },
    include: articleInclude,
  });
  return c.json({ data: toAdminArticle(copy) }, 201);
});

adminDiscoverRouter.post("/articles/:id/unpublish", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Article not found", 404);
  const user = c.get("user");
  // Taking it offline makes it editable again, so any waiting changes become the article.
  const draft = draftInput(existing, "unpublished");
  if (draft) {
    const saved = await saveArticle(draft, user?.id ?? null, existing.id, CLEAR_DRAFT);
    if (!saved.ok) return bad(c, saved.message);
    return c.json({ data: saved.article });
  }
  const article = await prisma.discoverArticle.update({
    where: { id: existing.id },
    data: {
      status: "unpublished",
      publishedAt: null,
      scheduledAt: null,
      updatedById: user?.id ?? null,
    },
    include: articleInclude,
  });
  return c.json({ data: toAdminArticle(article) });
});

adminDiscoverRouter.delete("/articles/:id", async (c) => {
  const existing = await prisma.discoverArticle.findUnique({ where: { id: c.req.param("id") }, select: { id: true } });
  if (!existing) return bad(c, "Article not found", 404);
  await prisma.discoverArticle.delete({ where: { id: existing.id } });
  return c.json({ data: { id: existing.id } });
});

adminDiscoverRouter.get("/categories", async (c) => {
  const categories = await prisma.discoverCategory.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: categories.map((category) => toCategoryJson(category, true)) });
});

adminDiscoverRouter.post("/categories", async (c) => {
  const parsed = categoryBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the category fields and try again.");
  const slug = await uniqueCategorySlug(parsed.data.slug || parsed.data.name);
  const category = await prisma.discoverCategory.create({
    data: {
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? "",
      icon: parsed.data.icon || null,
      displayOrder: parsed.data.displayOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
    },
  });
  return c.json({ data: toCategoryJson(category, true) }, 201);
});

adminDiscoverRouter.patch("/categories/:id", async (c) => {
  const existing = await prisma.discoverCategory.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return bad(c, "Category not found", 404);
  const parsed = categoryBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad(c, "Check the category fields and try again.");
  const slug = await uniqueCategorySlug(parsed.data.slug || parsed.data.name, existing.id);
  const category = await prisma.discoverCategory.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? "",
      icon: parsed.data.icon || null,
      displayOrder: parsed.data.displayOrder ?? existing.displayOrder,
      isActive: parsed.data.isActive ?? existing.isActive,
    },
  });
  return c.json({ data: toCategoryJson(category, true) });
});

adminDiscoverRouter.post("/categories/reorder", async (c) => {
  const body = z.object({ ids: z.array(z.string().min(1)).max(100) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return bad(c, "Category order is not valid.");
  try {
    await prisma.$transaction(
      body.data.ids.map((id, index) =>
        prisma.discoverCategory.update({ where: { id }, data: { displayOrder: index + 1 } }),
      ),
    );
  } catch {
    return bad(c, "One of those categories no longer exists.");
  }
  const categories = await prisma.discoverCategory.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: categories.map((category) => toCategoryJson(category, true)) });
});

const CLEAR_DRAFT = { pendingDraft: Prisma.DbNull, pendingDraftAt: null, pendingDraftById: null };

type SaveExtra = {
  pendingDraft?: typeof Prisma.DbNull;
  pendingDraftAt?: null;
  pendingDraftById?: null;
  lastPublishedAt?: Date;
  lastPublishedById?: string | null;
};

function draftInput(
  article: { pendingDraft: Prisma.JsonValue; publishedAt: Date | null; scheduledAt: Date | null },
  status: string,
): z.infer<typeof articleBody> | null {
  if (!article.pendingDraft || typeof article.pendingDraft !== "object") return null;
  const parsed = articleBody.safeParse({
    ...(article.pendingDraft as Record<string, unknown>),
    status,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    scheduledAt: article.scheduledAt?.toISOString() ?? null,
  });
  return parsed.success ? parsed.data : null;
}

async function saveArticle(
  input: z.infer<typeof articleBody>,
  userId: string | null,
  existingId: string | null,
  extra: SaveExtra = {},
): Promise<{ ok: true; article: ReturnType<typeof toAdminArticle> } | { ok: false; message: string }> {
  const publication = resolvePublication(
    {
      status: input.status as DiscoverStatus,
      publishedAt: input.publishedAt,
      scheduledAt: input.scheduledAt,
    },
    new Date(),
  );
  if (!publication.ok) return publication;
  if (input.categoryId) {
    const category = await prisma.discoverCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
    if (!category) return { ok: false, message: "Choose a category that exists." };
  }
  const categoryId = input.categoryId || null;
  // Category feature is per-category: one article only, and only when a category is set.
  const featuredInCategory = Boolean(input.featuredInCategory) && !!categoryId;
  const content = sanitizeDiscoverDoc(input.content);
  const slugSource = input.slug?.trim() || input.title;
  const slug = await uniqueArticleSlug(slugSource, existingId ?? undefined);
  const cover = input.coverImageUrl && isHttpsUrl(input.coverImageUrl) ? input.coverImageUrl : null;
  const data = {
    title: input.title,
    slug,
    excerpt: input.excerpt?.trim() ?? "",
    content: content as Prisma.InputJsonValue,
    categoryId,
    coverImageUrl: cover,
    coverImageAlt: input.coverImageAlt?.trim() || null,
    status: publication.status,
    isFeatured: input.isFeatured ?? false,
    featuredInCategory,
    displayOrder: input.displayOrder ?? 0,
    readingTimeMinutes: readingTimeMinutes(content),
    senecaEnabled: input.senecaEnabled ?? false,
    senecaPrompt: input.senecaPrompt?.trim() ?? "",
    senecaContext: input.senecaContext?.trim() ?? "",
    authorName: input.authorName?.trim() ?? "",
    publishedAt: publication.publishedAt,
    scheduledAt: publication.scheduledAt,
    updatedById: userId,
    ...(publication.status === "published" ? { lastPublishedAt: new Date(), lastPublishedById: userId } : {}),
    ...extra,
  };
  const article = await prisma.$transaction(async (tx) => {
    // Homepage feature is exclusive: Home shows one Explore article.
    if (data.isFeatured) {
      await tx.discoverArticle.updateMany({
        where: {
          isFeatured: true,
          ...(existingId ? { id: { not: existingId } } : {}),
        },
        data: { isFeatured: false },
      });
    }
    if (featuredInCategory && categoryId) {
      await tx.discoverArticle.updateMany({
        where: {
          categoryId,
          featuredInCategory: true,
          ...(existingId ? { id: { not: existingId } } : {}),
        },
        data: { featuredInCategory: false },
      });
    }
    return existingId
      ? tx.discoverArticle.update({ where: { id: existingId }, data, include: articleInclude })
      : tx.discoverArticle.create({ data: { ...data, createdById: userId }, include: articleInclude });
  });
  return { ok: true, article: toAdminArticle(article) };
}
