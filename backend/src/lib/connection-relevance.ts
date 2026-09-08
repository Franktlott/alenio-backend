const DAY_MS = 24 * 60 * 60 * 1000;

export const CONNECTION_RELEVANCE_WINDOW_DAYS = 30;

export type ConnectionRelevanceSignals = {
  candidateId: string;
  activeNow: boolean;
  lastDirectMessageAt: Date | null;
  recentDirectMessageCount: number;
  connectionUpdatedAt: Date;
  sharedWorkspaceCount: number;
};

/**
 * Sorts connections without adding ranking metadata to the returned objects.
 * Signal dates are intentionally reduced to UTC days, making the order stable
 * during polling while a small viewer-specific daily jitter rotates near ties.
 */
export function rankConnectionsByRelevance<T extends ConnectionRelevanceSignals>(
  candidates: T[],
  input: { viewerId: string; now?: Date },
): T[] {
  const utcDate = toUtcDate(input.now ?? new Date());

  return [...candidates].sort((left, right) => {
    if (left.activeNow !== right.activeNow) return left.activeNow ? -1 : 1;

    const scoreDifference =
      relevanceScore(right, input.viewerId, utcDate) -
      relevanceScore(left, input.viewerId, utcDate);
    if (scoreDifference !== 0) return scoreDifference;

    return left.candidateId.localeCompare(right.candidateId);
  });
}

function relevanceScore(
  signals: ConnectionRelevanceSignals,
  viewerId: string,
  utcDate: string,
): number {
  const recentActivityDays = signals.lastDirectMessageAt
    ? daysBefore(utcDate, signals.lastDirectMessageAt)
    : CONNECTION_RELEVANCE_WINDOW_DAYS;
  const activityScore =
    Math.max(0, CONNECTION_RELEVANCE_WINDOW_DAYS - recentActivityDays) * 100;
  const frequencyScore =
    Math.min(100, Math.max(0, Math.floor(signals.recentDirectMessageCount))) * 20;
  const acceptanceAgeDays = daysBefore(utcDate, signals.connectionUpdatedAt);
  const acceptanceScore = Math.max(0, 365 - acceptanceAgeDays);
  const workspaceScore =
    Math.min(10, Math.max(0, Math.floor(signals.sharedWorkspaceCount))) * 100;

  // 0–19 points: enough to move genuinely near-equal entries, but never enough
  // to outweigh one recent message, shared workspace, or activity-recency day.
  const dailyJitter = stableHash(`${viewerId}:${signals.candidateId}:${utcDate}`) % 20;

  return activityScore + frequencyScore + acceptanceScore + workspaceScore + dailyJitter;
}

function toUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBefore(utcDate: string, date: Date): number {
  const dayStart = Date.parse(`${utcDate}T00:00:00.000Z`);
  const signalDayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.max(0, Math.floor((dayStart - signalDayStart) / DAY_MS));
}

/** FNV-1a, kept local so ranking is deterministic on every runtime. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
