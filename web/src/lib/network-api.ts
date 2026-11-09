import { apiDeleteJson, apiGetJson, apiPostJson } from "./api";

/** Network feed, people search and mutuals. Connection CRUD lives in ./api.ts. */

export type ReactionSummary = Record<
  string,
  { count: number; userIds: string[]; users: Array<{ id: string; name: string }> }
>;

export type NetworkUpdate = {
  id: string;
  createdAt: string;
  metadata: {
    body: string | null;
    imageUrl: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    mediaType?: "image" | "video" | null;
  } | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: ReactionSummary;
  commentCount: number;
  canDelete: boolean;
};

export type NetworkUpdateComment = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
  reactions: ReactionSummary;
};

export type PersonSearchResult = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  isWorkplaceConnected?: boolean;
  sharedWorkspaceName?: string | null;
  connectionStatus?: string;
  canMessage?: boolean;
};

export const LIKE_EMOJI = "👍";

export function fetchNetworkFeed(cursor?: string | null, limit = 12, authorId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (authorId) params.set("authorId", authorId);
  return apiGetJson<{ data: { items: NetworkUpdate[]; nextCursor: string | null } }>(
    `/api/network-updates?${params.toString()}`,
  ).then((r) => r.data);
}

export function createNetworkPost(body: string) {
  return apiPostJson<{ data: NetworkUpdate }>("/api/network-updates", { body }).then((r) => r.data);
}

export function deleteNetworkPost(id: string) {
  return apiDeleteJson<unknown>(`/api/network-updates/${encodeURIComponent(id)}`);
}

export function hideNetworkPost(id: string) {
  return apiPostJson<unknown>(`/api/network-updates/${encodeURIComponent(id)}/hide`, {});
}

export function reactToNetworkPost(id: string, emoji = LIKE_EMOJI) {
  return apiPostJson<{ data: { toggled: boolean } }>(`/api/network-updates/${encodeURIComponent(id)}/react`, {
    emoji,
  }).then((r) => r.data);
}

export function fetchNetworkPostComments(id: string) {
  return apiGetJson<{ data: NetworkUpdateComment[] }>(
    `/api/network-updates/${encodeURIComponent(id)}/comments`,
  ).then((r) => r.data);
}

export function addNetworkPostComment(id: string, body: string) {
  return apiPostJson<{ data: NetworkUpdateComment }>(`/api/network-updates/${encodeURIComponent(id)}/comments`, {
    body,
  }).then((r) => r.data);
}

export function searchPeople(q: string) {
  return apiGetJson<{ data: PersonSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`).then(
    (r) => r.data,
  );
}

export function fetchMutualConnections(userId: string) {
  return apiGetJson<{ data: { people: Array<{ id: string; name: string | null; username: string | null; image: string | null }> } }>(
    `/api/connections/person/${encodeURIComponent(userId)}/mutual`,
  ).then((r) => r.data.people);
}

export function blockUser(userId: string) {
  return apiPostJson<{ data: { status: string } }>("/api/connections/block", { userId }).then((r) => r.data);
}

export function unblockUser(userId: string) {
  return apiDeleteJson<{ data: { status: string } }>("/api/connections/block", { userId }).then((r) => r.data);
}

/** "2h ago", "3d ago", else a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}
