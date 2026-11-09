import { apiGetJson, apiPostJson } from "./api";

/** Reader-side Discover client (signed-in users). Admin CRUD lives in discover-api.ts. */

export type DiscoverPublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  displayOrder: number;
};

export type DiscoverPublicArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: DiscoverPublicCategory | null;
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

export type DiscoverPublicArticleDetail = DiscoverPublicArticle & {
  content: { type: "doc"; content: DiscoverNode[] };
  senecaEnabled: boolean;
  senecaPrompt: string;
  senecaContext: string;
  viewCount: number;
};

const PURPLE = "#6d5ef8";

const CATEGORY_COLOR: Record<string, string> = {
  reflection: "#6d5ef8",
  growth: "#0f9d6e",
  leadership: "#4f46e5",
  communication: "#7c3aed",
  connection: "#059669",
  wellbeing: "#db2777",
  productivity: "#d97706",
};

export function discoverCategoryColor(slug: string | undefined | null): string {
  return CATEGORY_COLOR[slug ?? ""] ?? PURPLE;
}

/** Featured articles first; falls back to the most recent ones. Same rule as the mobile Home. */
export async function fetchHomeDiscoverArticles(): Promise<DiscoverPublicArticle[]> {
  try {
    const featured = await apiGetJson<{ data: DiscoverPublicArticle[] }>(
      "/api/discover/articles?featured=1&limit=8",
    ).then((r) => r.data);
    if (featured.length > 0) return featured.slice(0, 8);
    const recent = await apiGetJson<{ data: DiscoverPublicArticle[] }>("/api/discover/articles?limit=8").then(
      (r) => r.data,
    );
    return recent.slice(0, 8);
  } catch {
    return [];
  }
}

export function fetchPublicDiscoverCategories() {
  return apiGetJson<{ data: DiscoverPublicCategory[] }>("/api/discover/categories").then((r) => r.data);
}

export function fetchPublicDiscoverArticles() {
  return apiGetJson<{ data: DiscoverPublicArticle[] }>("/api/discover/articles?limit=50").then((r) => r.data);
}

export function fetchPublicDiscoverArticle(slug: string) {
  return apiGetJson<{ data: DiscoverPublicArticleDetail }>(
    `/api/discover/articles/${encodeURIComponent(slug)}`,
  ).then((r) => r.data);
}

export function recordDiscoverView(slug: string) {
  return apiPostJson<{ data: { viewCount: number } }>(
    `/api/discover/articles/${encodeURIComponent(slug)}/view`,
    {},
  );
}
