import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson, apiPutJson } from "./api";

export type DiscoverStatus = "draft" | "scheduled" | "published" | "unpublished" | "archived";

export type DiscoverCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  displayOrder: number;
  isActive?: boolean;
};

export type DiscoverDoc = {
  type: "doc";
  content: unknown[];
};

export type DiscoverAdminArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: DiscoverDoc;
  category: DiscoverCategory | null;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  status: DiscoverStatus;
  isFeatured: boolean;
  featuredInCategory: boolean;
  displayOrder: number;
  readingTimeMinutes: number;
  senecaEnabled: boolean;
  senecaPrompt: string;
  senecaContext: string;
  authorName?: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  lastPublishedAt?: string | null;
  lastPublishedBy?: { id: string; name: string | null; email: string; image: string | null } | null;
  /** Edits to a live article that readers can't see yet. */
  pendingDraft?: Partial<DiscoverArticleInput> | null;
  pendingDraftAt?: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  isLive?: boolean;
};

export type DiscoverArticleInput = {
  title: string;
  slug?: string;
  excerpt?: string;
  content?: unknown;
  categoryId?: string | null;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  status: DiscoverStatus;
  isFeatured?: boolean;
  featuredInCategory?: boolean;
  displayOrder?: number;
  senecaEnabled?: boolean;
  senecaPrompt?: string;
  senecaContext?: string;
  authorName?: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
};

export type DiscoverMetrics = {
  published: number;
  drafts: number;
  scheduled: number;
  featured: number;
  views: number;
};

export function fetchDiscoverMetrics() {
  return apiGetJson<{ data: DiscoverMetrics }>("/api/admin/discover/metrics").then((res) => res.data);
}

export function fetchDiscoverArticles(params: {
  q?: string;
  status?: string;
  categoryId?: string;
  sort?: "updatedAt" | "publishedAt";
  page?: number;
  pageSize?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.categoryId) search.set("categoryId", params.categoryId);
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiGetJson<{
    data: { items: DiscoverAdminArticle[]; total: number; page: number; pageSize: number };
  }>(`/api/admin/discover/articles${qs ? `?${qs}` : ""}`).then((res) => res.data);
}

export function fetchDiscoverArticle(id: string) {
  return apiGetJson<{ data: DiscoverAdminArticle }>(`/api/admin/discover/articles/${encodeURIComponent(id)}`).then(
    (res) => res.data,
  );
}

export function createDiscoverArticle(body: DiscoverArticleInput) {
  return apiPostJson<{ data: DiscoverAdminArticle }>("/api/admin/discover/articles", body).then((res) => res.data);
}

export function updateDiscoverArticle(id: string, body: DiscoverArticleInput) {
  return apiPatchJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}`,
    body,
  ).then((res) => res.data);
}

export function duplicateDiscoverArticle(id: string) {
  return apiPostJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}/duplicate`,
    {},
  ).then((res) => res.data);
}

export function unpublishDiscoverArticle(id: string) {
  return apiPostJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}/unpublish`,
    {},
  ).then((res) => res.data);
}

export function saveDiscoverDraft(id: string, body: DiscoverArticleInput) {
  return apiPutJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}/draft`,
    body,
  ).then((res) => res.data);
}

export function publishDiscoverDraft(id: string) {
  return apiPostJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}/draft/publish`,
    {},
  ).then((res) => res.data);
}

export function discardDiscoverDraft(id: string) {
  return apiDeleteJson<{ data: DiscoverAdminArticle }>(
    `/api/admin/discover/articles/${encodeURIComponent(id)}/draft`,
  ).then((res) => res.data);
}

export function deleteDiscoverArticle(id: string) {
  return apiDeleteJson<{ data: { id: string } }>(`/api/admin/discover/articles/${encodeURIComponent(id)}`);
}

export function fetchDiscoverCategories() {
  return apiGetJson<{ data: DiscoverCategory[] }>("/api/admin/discover/categories").then((res) => res.data);
}

export function createDiscoverCategory(body: Omit<DiscoverCategory, "id">) {
  return apiPostJson<{ data: DiscoverCategory }>("/api/admin/discover/categories", body).then((res) => res.data);
}

export function updateDiscoverCategory(id: string, body: Omit<DiscoverCategory, "id">) {
  return apiPatchJson<{ data: DiscoverCategory }>(
    `/api/admin/discover/categories/${encodeURIComponent(id)}`,
    body,
  ).then((res) => res.data);
}

export function reorderDiscoverCategories(ids: string[]) {
  return apiPostJson<{ data: DiscoverCategory[] }>("/api/admin/discover/categories/reorder", { ids }).then(
    (res) => res.data,
  );
}
