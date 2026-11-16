import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

export type AdminFeedPost = {
  id: string;
  source: "alenio" | "network" | "workspace";
  sourceLabel: string;
  type: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string; image: string | null } | null;
  commentCount: number;
  commentsLocked: boolean;
};

export type AdminFeedPostInput = {
  body?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  mediaType?: "image" | "video";
  commentsLocked?: boolean;
};

export async function fetchAdminFeedPosts(): Promise<AdminFeedPost[]> {
  const response = await apiGetJson<{ data: { items: AdminFeedPost[] } }>(
    "/api/admin/feed-posts",
  );
  return response.data.items ?? [];
}

export async function createAdminFeedPost(
  input: AdminFeedPostInput,
): Promise<AdminFeedPost> {
  return apiPostJson<{ data: AdminFeedPost }>("/api/admin/feed-posts", input).then(
    (r) => r.data,
  );
}

export async function deleteAdminFeedPost(activityId: string): Promise<void> {
  await apiDeleteJson<{ data: { ok: true } }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}`,
  );
}

export async function updateAdminFeedPostComments(
  activityId: string,
  commentsLocked: boolean,
): Promise<AdminFeedPost> {
  return apiPatchJson<{ data: AdminFeedPost }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}`,
    { commentsLocked },
  ).then((response) => response.data);
}
