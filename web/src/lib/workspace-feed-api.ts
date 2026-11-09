import { apiDeleteJson, apiGetJson, apiPostJson } from "./api";
import type { ReactionSummary } from "./network-api";

/**
 * Workspace feed: posts, recognition, milestones and new members for one
 * team. Mirrors the mobile Updates tab (`/api/teams/:teamId/activity`).
 */

export type WorkspaceActivityType =
  | "post"
  | "celebration"
  | "task_milestone"
  | "member_joined"
  | (string & {});

export type WorkspaceActivityMetadata = {
  userName?: string;
  count?: number;
  targetUserId?: string;
  targetName?: string;
  targetUserImage?: string | null;
  celebrationType?: string;
  message?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  mediaType?: "image" | "video" | null;
  taskTitle?: string;
};

export type WorkspaceActivity = {
  id: string;
  teamId: string;
  type: WorkspaceActivityType;
  createdAt: string;
  metadata: WorkspaceActivityMetadata | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: ReactionSummary;
  commentCount: number;
};

export type WorkspaceActivityComment = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
  reactions: ReactionSummary;
};

export type WorkspaceFeedPage = { items: WorkspaceActivity[]; nextCursor: string | null };

/** The kinds the feed shows. Single task completions stay out, like mobile. */
export const WORKSPACE_FEED_TYPES = ["post", "celebration", "task_milestone", "member_joined"] as const;

export type WorkspaceFeedFilter = "all" | "post" | "celebration" | "member_joined" | "task_milestone";

export const WORKSPACE_FEED_FILTERS: Array<{ id: WorkspaceFeedFilter; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "post", label: "Posts" },
  { id: "celebration", label: "Recognition" },
  { id: "member_joined", label: "New members" },
  { id: "task_milestone", label: "Milestones" },
];

export function isWorkspaceFeedType(type: string): boolean {
  return (WORKSPACE_FEED_TYPES as readonly string[]).includes(type);
}

const team = (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}`;

export function fetchWorkspaceFeed(teamId: string, cursor?: string | null, limit = 12) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiGetJson<{ data: WorkspaceFeedPage }>(`${team(teamId)}/activity?${params.toString()}`).then(
    (r) => r.data,
  );
}

export function createWorkspacePost(teamId: string, body: string) {
  return apiPostJson<{ data: WorkspaceActivity }>(`${team(teamId)}/activity/posts`, { body }).then((r) => r.data);
}

export function reactToWorkspaceActivity(teamId: string, activityId: string, emoji: string) {
  return apiPostJson<{ data: { toggled: boolean } }>(
    `${team(teamId)}/activity/${encodeURIComponent(activityId)}/react`,
    { emoji },
  ).then((r) => r.data);
}

export function deleteWorkspaceActivity(teamId: string, activityId: string) {
  return apiDeleteJson<unknown>(`${team(teamId)}/activity/${encodeURIComponent(activityId)}`);
}

export function fetchWorkspaceActivityComments(teamId: string, activityId: string) {
  return apiGetJson<{ data: WorkspaceActivityComment[] }>(
    `${team(teamId)}/activity/${encodeURIComponent(activityId)}/comments`,
  ).then((r) => r.data);
}

export function addWorkspaceActivityComment(teamId: string, activityId: string, body: string) {
  return apiPostJson<{ data: WorkspaceActivityComment }>(
    `${team(teamId)}/activity/${encodeURIComponent(activityId)}/comments`,
    { body },
  ).then((r) => r.data);
}

/** Recognition types and how they read. Mirrors mobile celebration-themes. */
export const CELEBRATION_LABELS: Record<string, { label: string; emoji: string }> = {
  shoutout: { label: "Shoutout", emoji: "⭐" },
  mvp: { label: "MVP", emoji: "🏆" },
  beyond: { label: "Above & Beyond", emoji: "🏅" },
  rockstar: { label: "Rockstar", emoji: "⚡" },
  clutch: { label: "Clutch", emoji: "🎯" },
  teamplayer: { label: "Team Player", emoji: "🤝" },
  bigbrain: { label: "Big Brain", emoji: "💡" },
  onfire: { label: "On Fire", emoji: "🔥" },
  milestone: { label: "Milestone", emoji: "🏁" },
  grateful: { label: "Grateful", emoji: "💜" },
};

export function celebrationLabel(type: string | undefined) {
  return (type && CELEBRATION_LABELS[type]) || CELEBRATION_LABELS.shoutout!;
}

export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Who the feed card is about. Every join path writes `userName`; the actor is the same person. */
export function activityActorName(item: WorkspaceActivity): string {
  return item.user?.name?.trim() || item.metadata?.userName?.trim() || "Someone";
}

/** The action phrase that follows the name in the card header. */
export function activityHeadline(item: WorkspaceActivity): string {
  switch (item.type) {
    case "post":
      return "shared an update";
    case "member_joined":
      return "joined the workspace";
    case "celebration":
      return `recognized ${item.metadata?.targetName?.trim() || "a teammate"}`;
    case "task_milestone":
      return "hit a milestone";
    case "task_completed":
      return item.metadata?.taskTitle ? `completed "${item.metadata.taskTitle}"` : "completed a task";
    default:
      return "posted an update";
  }
}
