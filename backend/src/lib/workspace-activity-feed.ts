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
