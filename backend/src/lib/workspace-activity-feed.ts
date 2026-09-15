export function parseActivityMetadata(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Personal (no-workspace) recognition belongs on a team feed when both people are members. */
export function personalCelebrationBelongsToTeam(input: {
  actorUserId: string | null | undefined;
  metadata: Record<string, unknown> | null;
  memberIds: ReadonlySet<string>;
}): boolean {
  const actorId = input.actorUserId;
  if (!actorId || !input.memberIds.has(actorId)) return false;
  const targetId = input.metadata?.targetUserId;
  return typeof targetId === "string" && input.memberIds.has(targetId);
}

/**
 * Whether a workspace may read or write an activity. Team-owned rows are easy;
 * personal celebrations count only while they sit on this workspace's feed, so
 * reacting and commenting stay in step with what the feed actually shows.
 */
export function activityVisibleToTeam(input: {
  activity: {
    teamId: string | null;
    type: string;
    userId: string | null;
    metadata: string | null;
  };
  teamId: string;
  memberIds: ReadonlySet<string>;
}): boolean {
  const { activity, teamId, memberIds } = input;
  if (activity.teamId === teamId) return true;
  if (activity.teamId != null || activity.type !== "celebration") return false;
  return personalCelebrationBelongsToTeam({
    actorUserId: activity.userId,
    metadata: parseActivityMetadata(activity.metadata),
    memberIds,
  });
}
