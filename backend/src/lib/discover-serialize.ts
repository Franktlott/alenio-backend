import type { DiscoverArticle, DiscoverCategory } from "@prisma/client";
import { sanitizeDiscoverDoc, type DiscoverDoc } from "./discover-document";
import { discoverArticleIsLive, liveInstant } from "./discover-visibility";

export type DiscoverCategoryJson = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  displayOrder: number;
  isActive?: boolean;
};

export type DiscoverArticleSummaryJson = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: DiscoverCategoryJson | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  readingTimeMinutes: number;
  isFeatured: boolean;
  featuredInCategory: boolean;
  displayOrder: number;
  publishedAt: string | null;
  /** Shown to readers as "Updated …": the later of going live and the last republish. */
  lastPublishedAt: string | null;
  authorName: string;
  updatedAt: string;
};

export type DiscoverArticleDetailJson = DiscoverArticleSummaryJson & {
  content: DiscoverDoc;
  senecaEnabled: boolean;
  senecaPrompt: string;
  senecaContext: string;
  viewCount: number;
};

type ArticleWithCategory = DiscoverArticle & {
  category: DiscoverCategory | null;
  lastPublishedBy?: { id: string; name: string | null; email: string; image: string | null } | null;
};

export function toCategoryJson(category: DiscoverCategory, includeInactiveFlag = false): DiscoverCategoryJson {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    displayOrder: category.displayOrder,
    ...(includeInactiveFlag ? { isActive: category.isActive } : {}),
  };
}

function publicCategory(category: DiscoverCategory | null): DiscoverCategoryJson | null {
  if (!category?.isActive) return null;
  return toCategoryJson(category);
}

function latest(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

export function toPublicSummary(article: ArticleWithCategory, now: Date): DiscoverArticleSummaryJson | null {
  if (!discoverArticleIsLive(article, now)) return null;
  const liveAt = liveInstant(article);
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    category: publicCategory(article.category),
    coverImageUrl: article.coverImageUrl,
    coverImageAlt: article.coverImageAlt,
    readingTimeMinutes: article.readingTimeMinutes,
    isFeatured: article.isFeatured,
    featuredInCategory: article.featuredInCategory,
    displayOrder: article.displayOrder,
    publishedAt: liveAt ? liveAt.toISOString() : null,
    lastPublishedAt: latest(liveAt, article.lastPublishedAt)?.toISOString() ?? null,
    authorName: article.authorName,
    updatedAt: article.updatedAt.toISOString(),
  };
}

export function toPublicDetail(article: ArticleWithCategory, now: Date): DiscoverArticleDetailJson | null {
  const summary = toPublicSummary(article, now);
  if (!summary) return null;
  return {
    ...summary,
    content: sanitizeDiscoverDoc(article.content),
    senecaEnabled: article.senecaEnabled,
    senecaPrompt: article.senecaEnabled ? article.senecaPrompt : "",
    senecaContext: article.senecaEnabled ? article.senecaContext : "",
    viewCount: article.viewCount,
  };
}

export function toAdminArticle(article: ArticleWithCategory) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: sanitizeDiscoverDoc(article.content),
    category: article.category ? toCategoryJson(article.category, true) : null,
    categoryId: article.categoryId,
    coverImageUrl: article.coverImageUrl,
    coverImageAlt: article.coverImageAlt,
    status: article.status,
    isFeatured: article.isFeatured,
    featuredInCategory: article.featuredInCategory,
    displayOrder: article.displayOrder,
    readingTimeMinutes: article.readingTimeMinutes,
    senecaEnabled: article.senecaEnabled,
    senecaPrompt: article.senecaPrompt,
    senecaContext: article.senecaContext,
    authorName: article.authorName,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    scheduledAt: article.scheduledAt?.toISOString() ?? null,
    lastPublishedAt: article.lastPublishedAt?.toISOString() ?? null,
    pendingDraft: article.pendingDraft ?? null,
    pendingDraftAt: article.pendingDraftAt?.toISOString() ?? null,
    lastPublishedBy: article.lastPublishedBy
      ? {
          id: article.lastPublishedBy.id,
          name: article.lastPublishedBy.name,
          email: article.lastPublishedBy.email,
          image: article.lastPublishedBy.image,
        }
      : null,
    viewCount: article.viewCount,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}
