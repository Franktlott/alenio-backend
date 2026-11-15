export type MomentumOutcome = {
  id: string;
  completedAt: Date;
  /** Kept for storage/compat; Stars counting ignores on-time. */
  onTime: boolean;
};

export type MomentumProjection = {
  /** Active star count = non-revoked eligible completions. */
  currentStreak: number;
  /** Highest star total reached from this evidence set. */
  personalBestStreak: number;
  momentumRunStartedAt: Date | null;
  momentumLastQualifiedAt: Date | null;
};

function oldestFirst(a: MomentumOutcome, b: MomentumOutcome): number {
  const dateOrder = a.completedAt.getTime() - b.completedAt.getTime();
  return dateOrder !== 0 ? dateOrder : a.id.localeCompare(b.id);
}

function newestFirst(a: MomentumOutcome, b: MomentumOutcome): number {
  const dateOrder = b.completedAt.getTime() - a.completedAt.getTime();
  return dateOrder !== 0 ? dateOrder : b.id.localeCompare(a.id);
}

/** Next Stars milestone after the current total (5, 10, 15, then every 10). */
export function nextStarsMilestone(stars: number): number {
  const value = Math.max(0, Math.floor(stars));
  if (value < 5) return 5;
  if (value < 10) return 10;
  if (value < 15) return 15;
  return Math.floor(value / 10) * 10 + 10;
}

/** Previous milestone floor used to render the current hollow→filled segment. */
export function previousStarsMilestone(stars: number): number {
  const value = Math.max(0, Math.floor(stars));
  if (value < 5) return 0;
  if (value < 10) return 5;
  if (value < 15) return 10;
  if (value < 20) return 15;
  return Math.floor(value / 10) * 10;
}

export function starsMilestoneSegment(stars: number): {
  currentStars: number;
  nextMilestone: number;
  previousMilestone: number;
  filledInSegment: number;
  segmentSize: number;
  remainingToMilestone: number;
} {
  const currentStars = Math.max(0, Math.floor(stars));
  const nextMilestone = nextStarsMilestone(currentStars);
  const previousMilestone = previousStarsMilestone(currentStars);
  const segmentSize = Math.max(1, nextMilestone - previousMilestone);
  const filledInSegment = Math.min(segmentSize, currentStars - previousMilestone);
  return {
    currentStars,
    nextMilestone,
    previousMilestone,
    filledInSegment,
    segmentSize,
    remainingToMilestone: Math.max(0, nextMilestone - currentStars),
  };
}

export function isStarsMilestone(value: number): boolean {
  return value === 5 || value === 10 || value === 15 || (value >= 20 && value % 10 === 0);
}

/**
 * Stars projection: every non-revoked completion credit counts.
 * Late vs on-time no longer breaks the total — uncomplete/revoke is what removes a star.
 */
export function projectMomentum(outcomes: readonly MomentumOutcome[]): MomentumProjection {
  const orderedOldest = [...outcomes].sort(oldestFirst);
  const orderedNewest = [...outcomes].sort(newestFirst);
  const currentStreak = outcomes.length;
  const personalBestStreak = currentStreak;
  const oldest = orderedOldest[0] ?? null;
  const newest = orderedNewest[0] ?? null;

  return {
    currentStreak,
    personalBestStreak,
    momentumRunStartedAt: oldest?.completedAt ?? null,
    momentumLastQualifiedAt: newest?.completedAt ?? null,
  };
}
