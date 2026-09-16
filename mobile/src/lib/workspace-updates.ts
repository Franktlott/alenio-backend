import type {
  ActivityApiEvent,
  ActivityFeedItem,
  ActivityFeedType,
  ActivityReactions,
} from "@/components/activity/types";
import type { PersonalRecognition } from "@/lib/types";

/** Posts, recognition, milestones and completed work on the Updates tab. */
export const WORKSPACE_UPDATE_TYPES = [
  "post",
  "celebration",
  "task_milestone",
  "task_completed",
] as const satisfies readonly ActivityFeedType[];

export type WorkspaceUpdateType = (typeof WORKSPACE_UPDATE_TYPES)[number];

export function isWorkspaceUpdateActivity(
  type: ActivityFeedType,
): type is WorkspaceUpdateType {
  return (
    type === "post" ||
    type === "celebration" ||
    type === "task_milestone" ||
    type === "task_completed"
  );
}

/** Momentum celebrates 5, 10 and 15, then every tenth on-time completion. */
const MILESTONE_STEPS = [5, 10, 15] as const;

export function milestoneStreakCount(count: number | null | undefined): number {
  return typeof count === "number" && count > 0 ? Math.floor(count) : 0;
}

/**
 * The next streak the backend will celebrate. Mirrors isMilestone() in
 * backend/src/lib/momentum-service.ts — keep the two in step.
 */
export function nextMilestoneTarget(count: number | null | undefined): number {
  const streak = milestoneStreakCount(count);
  const step = MILESTONE_STEPS.find((value) => value > streak);
  if (step) return step;
  return Math.floor(streak / 10) * 10 + 10;
}

/**
 * Milestone counts are a run of on-time completions, not a weekly total, so
 * the copy says "in a row" rather than "this week".
 */
export function milestoneSubtitle(count: number | null | undefined): string {
  return milestoneStreakCount(count) === 0
    ? "An on-time streak in progress."
    : "All completed on time, in a row.";
}

export function recognitionInvolvesWorkspaceMembers(
  giverId: string | null | undefined,
  recipientId: string | null | undefined,
  memberIds: ReadonlySet<string>,
): boolean {
  if (!giverId || !recipientId) return false;
  return memberIds.has(giverId) && memberIds.has(recipientId);
}

export function personalRecognitionToActivityEvent(
  recognition: PersonalRecognition,
): ActivityApiEvent | null {
  const giver = recognition.giver;
  const recipient = recognition.recipient;
  if (!giver?.id || !recipient?.id) return null;
  return {
    id: recognition.id,
    teamId: recognition.workspace?.id,
    type: "celebration",
    createdAt: recognition.createdAt,
    metadata: {
      targetUserId: recipient.id,
      targetName: recipient.name ?? undefined,
      targetUserImage: recipient.image,
      celebrationType: recognition.celebrationType,
      message: recognition.message,
    },
    user: {
      id: giver.id,
      name: giver.name || "Someone",
      image: giver.image,
    },
    reactions: recognition.reactions ?? {},
    commentCount: recognition.commentCount ?? 0,
  };
}

/**
 * Mirrors the server rule of one reaction per person: the old one always goes,
 * and a different emoji takes its place. Used to show the tap landing before
 * the feed refetches.
 */
export function applyReactionToggle(
  reactions: ActivityReactions | null | undefined,
  emoji: string,
  user: { id: string; name: string },
): ActivityReactions {
  const mine = Object.entries(reactions ?? {}).find(([, row]) =>
    row.userIds.includes(user.id),
  )?.[0];
  const next: ActivityReactions = {};

  for (const [key, row] of Object.entries(reactions ?? {})) {
    if (key !== mine) {
      next[key] = row;
      continue;
    }
    const userIds = row.userIds.filter((id) => id !== user.id);
    if (userIds.length > 0) {
      next[key] = {
        count: userIds.length,
        userIds,
        users: (row.users ?? []).filter((person) => person.id !== user.id),
      };
    }
  }

  if (mine === emoji) return next;

  const row = next[emoji];
  next[emoji] = {
    count: (row?.count ?? 0) + 1,
    userIds: [...(row?.userIds ?? []), user.id],
    users: [...(row?.users ?? []), { id: user.id, name: user.name }],
  };
  return next;
}

/** Compact timestamp used on Updates cards (`2h`, `20m`). */
export function formatFeedTimestamp(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 365) {
    // Weeks read better than "8w" past a couple of months, so switch to months
    // on the same 30-day rounding people expect from a social feed.
    const months = Math.floor(days / 30);
    return months < 2 ? `${weeks}w` : `${months}mo`;
  }
  return `${Math.floor(days / 365)}y`;
}

/** The author line owns the name, so the post itself only states the action. */
export function workspaceUpdateHeadline(item: ActivityFeedItem): string {
  if (item.type === "celebration") {
    const toName = item.metadata.targetName ?? "a teammate";
    return `Recognized ${toName}`;
  }
  if (item.type === "task_completed") {
    const taskTitle = item.metadata.taskTitle ?? item.title;
    return `Completed ${taskTitle}`;
  }
  return item.title;
}

export function workspaceUpdateBody(item: ActivityFeedItem): string | null {
  if (item.type === "celebration") {
    return item.metadata.message?.trim() || null;
  }
  if (item.type === "task_completed") return null;
  return item.description?.trim() || null;
}

export function totalReactionCount(
  reactions: ActivityReactions | null | undefined,
): number {
  return Object.values(reactions ?? {}).reduce(
    (sum, row) => sum + (row.count ?? 0),
    0,
  );
}

/** The emoji the signed-in person left, since only one reaction sticks. */
export function myReactionEmoji(
  reactions: ActivityReactions | null | undefined,
  userId: string | null | undefined,
): string | null {
  if (!userId) return null;
  const found = Object.entries(reactions ?? {}).find(([, row]) =>
    row.userIds.includes(userId),
  );
  return found?.[0] ?? null;
}

export function hasReacted(
  reactions: ActivityReactions | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return Object.values(reactions ?? {}).some((row) =>
    row.userIds.includes(userId),
  );
}

/** Names of the two people on a recognition, for the identity line. */
export function recognitionParticipants(item: ActivityFeedItem): {
  giverName: string;
  recipientName: string;
} {
  return {
    giverName: item.actor?.name?.trim() || "Someone",
    recipientName: item.metadata.targetName?.trim() || "a teammate",
  };
}

/**
 * Category pill copy. `resolveThemeLabel` supplies display names for the
 * picker's keys; unknown keys fall back to their own words.
 */
export function recognitionCategoryLabel(
  celebrationType: string | null | undefined,
  resolveThemeLabel: (key: string) => string | null = () => null,
): string | null {
  const raw = celebrationType?.trim();
  if (!raw) return null;
  if (raw === "recognition" || raw === "other") return null;
  const themeLabel = resolveThemeLabel(raw);
  const label = themeLabel ?? raw.replace(/[_-]+/g, " ").trim();
  return label ? label.toUpperCase() : null;
}

/** Icons carry the meaning, so a count only appears once there is one. */
export function reactionActionLabel(count: number): string {
  return count > 0 ? String(count) : "";
}

export function commentActionLabel(count: number): string {
  return count > 0 ? String(count) : "";
}
