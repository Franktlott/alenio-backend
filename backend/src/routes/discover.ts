import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { auth } from "../auth";
import { toCategoryJson, toPublicDetail, toPublicSummary } from "../lib/discover-serialize";
import { liveArticleWhere } from "../lib/discover-visibility";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const articleInclude = { category: true } satisfies Prisma.DiscoverArticleInclude;

function noCache(c: { header: (name: string, value: string) => void }) {
  c.header("Cache-Control", "private, no-cache");
}

function parseLimit(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(value)));
}

export const discoverRouter = new Hono<{ Variables: Variables }>();

discoverRouter.use("*", authGuard);

discoverRouter.get("/categories", async (c) => {
  noCache(c);
  const categories = await prisma.discoverCategory.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: categories.map((category) => toCategoryJson(category)) });
});

discoverRouter.get("/articles", async (c) => {
  noCache(c);
  const now = new Date();
  const categorySlug = c.req.query("category")?.trim().toLowerCase() ?? "";
  const featured = c.req.query("featured")?.trim() ?? "";
  const limit = parseLimit(c.req.query("limit"), featured ? 6 : 20);
  const where: Prisma.DiscoverArticleWhereInput = { ...liveArticleWhere(now) };
  if (categorySlug) {
    where.category = { slug: categorySlug, isActive: true };
  }
  if (featured === "1" || featured === "true") where.isFeatured = true;
  if (featured === "category") where.featuredInCategory = true;

  const rows = await prisma.discoverArticle.findMany({
    where,
    include: articleInclude,
    take: 200,
  });
  const visible = rows
    .map((row) => toPublicSummary(row, now))
    .filter((row): row is NonNullable<typeof row> => row !== null);
  visible.sort((a, b) => {
    if (featured === "1" || featured === "true" || featured === "category") {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    }
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });
  return c.json({ data: visible.slice(0, limit) });
});

discoverRouter.get("/articles/:slug", async (c) => {
  noCache(c);
  const now = new Date();
  const article = await prisma.discoverArticle.findUnique({
    where: { slug: c.req.param("slug") },
    include: articleInclude,
  });
  const detail = article ? toPublicDetail(article, now) : null;
  if (!detail) {
    return c.json({ error: { message: "Article not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: detail });
});

discoverRouter.post("/articles/:slug/view", async (c) => {
  noCache(c);
  const now = new Date();
  const article = await prisma.discoverArticle.findUnique({
    where: { slug: c.req.param("slug") },
    include: articleInclude,
  });
  if (!article || !toPublicSummary(article, now)) {
    return c.json({ error: { message: "Article not found", code: "NOT_FOUND" } }, 404);
  }
  const updated = await prisma.discoverArticle.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });
  return c.json({ data: { viewCount: updated.viewCount } });
});
