import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

export type AlenioPostAudience =
  | "all"
  | "workspace_members"
  | "non_workspace_members";

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
  alenioAudience: AlenioPostAudience;
};

export type AdminFeedPostInput = {
  body?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  mediaType?: "image" | "video";
  commentsLocked?: boolean;
  audience?: AlenioPostAudience;
};

export type AdminFeedCommentReactions = Record<
  string,
  {
    count: number;
    userIds: string[];
    users: Array<{ id: string; name: string }>;
  }
>;

export type AdminFeedComment = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
  reactions: AdminFeedCommentReactions;
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

export async function fetchAdminFeedPostComments(
  activityId: string,
): Promise<AdminFeedComment[]> {
  return apiGetJson<{ data: { items: AdminFeedComment[] } }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}/comments`,
  ).then((response) => response.data.items ?? []);
}

export async function createAdminFeedPostComment(
  activityId: string,
  body: string,
  parentId?: string,
): Promise<AdminFeedComment> {
  return apiPostJson<{ data: AdminFeedComment }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}/comments`,
    { body, parentId },
  ).then((response) => response.data);
}

export async function reactToAdminFeedPostComment(
  activityId: string,
  commentId: string,
  emoji: string,
): Promise<AdminFeedComment | null> {
  return apiPostJson<{ data: AdminFeedComment | null }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}/comments/${encodeURIComponent(commentId)}/react`,
    { emoji },
  ).then((response) => response.data);
}

export async function deleteAdminFeedPostComment(
  activityId: string,
  commentId: string,
): Promise<void> {
  await apiDeleteJson<{ data: { ok: true } }>(
    `/api/admin/feed-posts/${encodeURIComponent(activityId)}/comments/${encodeURIComponent(commentId)}`,
  );
}
