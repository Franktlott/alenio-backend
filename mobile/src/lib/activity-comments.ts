import type { ActivityReactions } from "@/components/activity/types";

export type ActivityComment = {
  id: string;
  body: string;
  createdAt: string;
  /** Set when this comment answers another one. */
  parentId?: string | null;
  author: { id: string; name: string | null; image: string | null };
  canDelete: boolean;
  reactions?: ActivityReactions;
};

/** A top-level comment with the replies that hang off it. */
export type CommentThread = {
  comment: ActivityComment;
  replies: ActivityComment[];
};

export const COMMENT_MAX_LENGTH = 1000;

export function activityCommentsKey(activityId: string) {
  return ["activity-comments", activityId] as const;
}

export function activityDetailKey(teamId: string, activityId: string) {
  return ["team-activity-item", teamId, activityId] as const;
}

/**
 * Groups a flat comment list into threads, oldest first, with replies under
 * the comment they answer. Replies whose parent is missing are kept as
 * top-level so a comment can never disappear from the thread.
 */
export function buildCommentThreads(
  comments: readonly ActivityComment[],
): CommentThread[] {
  const byId = new Map<string, CommentThread>();
  const roots: CommentThread[] = [];

  for (const comment of comments) {
    if (comment.parentId) continue;
    const thread: CommentThread = { comment, replies: [] };
    byId.set(comment.id, thread);
    roots.push(thread);
  }

  for (const comment of comments) {
    if (!comment.parentId) continue;
    const parent = byId.get(comment.parentId);
    if (parent) {
      parent.replies.push(comment);
    } else {
      roots.push({ comment, replies: [] });
    }
  }

  return roots;
}

/** Local stand-in for a comment that is still in flight. */
export function pendingComment(
  body: string,
  author: { id: string; name: string | null; image: string | null },
  now = Date.now(),
  parentId: string | null = null,
): ActivityComment {
  return {
    id: `pending-${now}`,
    body: body.trim(),
    createdAt: new Date(now).toISOString(),
    parentId,
    author,
    canDelete: false,
    reactions: {},
  };
}

export function isPendingComment(comment: ActivityComment): boolean {
  return comment.id.startsWith("pending-");
}

/** "1 comment" / "4 comments", so the thread header never reads awkwardly. */
export function commentCountLabel(count: number): string {
  return `${count} ${count === 1 ? "comment" : "comments"}`;
}

export function reactionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "reaction" : "reactions"}`;
}

export function replyCountLabel(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}
