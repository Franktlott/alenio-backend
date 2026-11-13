import { api } from "@/lib/api/api";
import { articlesForHome } from "@/lib/discover-selection";

export { articlesForHome };

export type DiscoverCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  displayOrder: number;
};

export type DiscoverArticleSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: DiscoverCategory | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  readingTimeMinutes: number;
  isFeatured: boolean;
  featuredInCategory: boolean;
  displayOrder: number;
  publishedAt: string | null;
  lastPublishedAt?: string | null;
  authorName?: string;
  updatedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "By the Alenio Team · Updated Nov 6, 2026". Says "Published" until it has been republished on a later day. */
export function discoverByline(article: {
  authorName?: string | null;
  publishedAt?: string | null;
  lastPublishedAt?: string | null;
}): { author: string; when: string | null } {
  const author = article.authorName?.trim() || "the Alenio Team";
  const published = article.publishedAt ? new Date(article.publishedAt) : null;
  const last = article.lastPublishedAt ? new Date(article.lastPublishedAt) : published;
  if (!last || Number.isNaN(last.getTime())) return { author, when: null };
  const updated = published && !Number.isNaN(published.getTime()) && last.getTime() - published.getTime() > DAY_MS;
  const date = last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { author, when: `${updated ? "Updated" : "Published"} ${date}` };
}

export type DiscoverMark = { type?: string; attrs?: { href?: string } };
export type DiscoverNode = {
  type?: string;
  text?: string;
  marks?: DiscoverMark[];
  attrs?: { level?: number; src?: string; alt?: string | null; [key: string]: unknown };
  content?: DiscoverNode[];
};

export type DiscoverArticleDetail = DiscoverArticleSummary & {
  content: { type: "doc"; content: DiscoverNode[] };
  senecaEnabled: boolean;
  senecaPrompt: string;
  senecaContext: string;
  viewCount: number;
};

export async function fetchHomeDiscoverArticles(): Promise<DiscoverArticleSummary[]> {
  try {
    const featured = await api.get<DiscoverArticleSummary[]>(
      "/api/discover/articles?featured=1&limit=8",
    );
    if (featured.length > 0) return featured.slice(0, 8);
    const recent = await api.get<DiscoverArticleSummary[]>(
      "/api/discover/articles?limit=8",
    );
    return recent.slice(0, 8);
  } catch {
    return [];
  }
}

export function fetchDiscoverArticles() {
  return api.get<DiscoverArticleSummary[]>("/api/discover/articles?limit=50");
}

export function fetchDiscoverCategories() {
  return api.get<DiscoverCategory[]>("/api/discover/categories");
}

export function fetchDiscoverArticle(slug: string) {
  return api.get<DiscoverArticleDetail>(
    `/api/discover/articles/${encodeURIComponent(slug)}`,
  );
}

export function recordDiscoverView(slug: string) {
  return api.post<{ viewCount: number }>(
    `/api/discover/articles/${encodeURIComponent(slug)}/view`,
    {},
  );
}
