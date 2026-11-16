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

export type StarsJourneyIconKey = "star" | "bolt" | "mountain" | "trophy";

export type StarsJourneyCatalogEntry = {
  id: string;
  threshold: number;
  title: string;
  iconKey: StarsJourneyIconKey;
};

/** Named journey milestones from the Stars mockup. */
export const STARS_JOURNEY_CATALOG: readonly StarsJourneyCatalogEntry[] = [
  { id: "getting-started", threshold: 5, title: "Getting Started", iconKey: "star" },
  { id: "finding-rhythm", threshold: 10, title: "Finding Your Rhythm", iconKey: "bolt" },
  { id: "building-momentum", threshold: 20, title: "Building Momentum", iconKey: "mountain" },
  { id: "going-further", threshold: 50, title: "Going Further", iconKey: "trophy" },
] as const;

export type StarsJourneyStatus = "completed" | "active" | "locked";

export type StarsJourneyStep = {
  id: string;
  threshold: number;
  title: string;
  iconKey: StarsJourneyIconKey;
  status: StarsJourneyStatus;
  progressCurrent: number;
  progressTarget: number;
};

function oldestFirst(a: MomentumOutcome, b: MomentumOutcome): number {
  const dateOrder = a.completedAt.getTime() - b.completedAt.getTime();
  return dateOrder !== 0 ? dateOrder : a.id.localeCompare(b.id);
}

function newestFirst(a: MomentumOutcome, b: MomentumOutcome): number {
  const dateOrder = b.completedAt.getTime() - a.completedAt.getTime();
  return dateOrder !== 0 ? dateOrder : b.id.localeCompare(a.id);
}

/** Ladder after the named 50 tier continues every +50. */
export function nextStarsMilestone(stars: number): number {
  const value = Math.max(0, Math.floor(stars));
  if (value < 5) return 5;
  if (value < 10) return 10;
  if (value < 20) return 20;
  if (value < 50) return 50;
  return Math.floor(value / 50) * 50 + 50;
}

export function previousStarsMilestone(stars: number): number {
  const value = Math.max(0, Math.floor(stars));
  if (value < 5) return 0;
  if (value < 10) return 5;
  if (value < 20) return 10;
  if (value < 50) return 20;
  return Math.floor(value / 50) * 50;
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
  if (value === 5 || value === 10 || value === 20 || value === 50) return true;
  return value > 50 && value % 50 === 0;
}

export function starsJourneyTitle(threshold: number): string {
  const named = STARS_JOURNEY_CATALOG.find((entry) => entry.threshold === threshold);
  if (named) return named.title;
  if (threshold <= 50) return "Going Further";
  return "Going Further +";
}

export function starsJourneyIconKey(threshold: number): StarsJourneyIconKey {
  const named = STARS_JOURNEY_CATALOG.find((entry) => entry.threshold === threshold);
  return named?.iconKey ?? "trophy";
}

/** Build the visible journey list for a star total (named tiers + next locked/active). */
export function buildStarsJourney(stars: number): StarsJourneyStep[] {
  const currentStars = Math.max(0, Math.floor(stars));
  const steps: StarsJourneyStep[] = STARS_JOURNEY_CATALOG.map((entry) => {
    if (currentStars >= entry.threshold) {
      return {
        id: entry.id,
        threshold: entry.threshold,
        title: entry.title,
        iconKey: entry.iconKey,
        status: "completed",
        progressCurrent: entry.threshold,
        progressTarget: entry.threshold,
      };
    }
    const previous = previousStarsMilestone(entry.threshold - 1);
    const active =
      currentStars >= previous && currentStars < entry.threshold;
    return {
      id: entry.id,
      threshold: entry.threshold,
      title: entry.title,
      iconKey: entry.iconKey,
      status: active ? "active" : "locked",
      progressCurrent: Math.min(currentStars, entry.threshold),
      progressTarget: entry.threshold,
    };
  });

  // After the named 50 tier, expose completed +50 steps and the next target.
  if (currentStars >= 50) {
    for (let threshold = 100; threshold <= currentStars; threshold += 50) {
      steps.push({
        id: `going-further-${threshold}`,
        threshold,
        title: starsJourneyTitle(threshold),
        iconKey: "trophy",
        status: "completed",
        progressCurrent: threshold,
        progressTarget: threshold,
      });
    }
    const next = nextStarsMilestone(currentStars);
    if (!steps.some((step) => step.threshold === next)) {
      steps.push({
        id: `going-further-${next}`,
        threshold: next,
        title: starsJourneyTitle(next),
        iconKey: "trophy",
        status: "active",
        progressCurrent: Math.min(currentStars, next),
        progressTarget: next,
      });
    }
  }

  // Exactly one active row: the soonest incomplete step.
  let sawActive = false;
  for (const step of steps) {
    if (step.status === "active") {
      if (sawActive) step.status = "locked";
      else sawActive = true;
    }
  }
  if (!sawActive) {
    const locked = steps.find((step) => step.status === "locked");
    if (locked) {
      locked.status = "active";
      locked.progressCurrent = Math.min(currentStars, locked.threshold);
    }
  }

  return steps;
}

/**
 * Consecutive local calendar days (YYYY-MM-DD) with ≥1 completion, ending at
 * today or yesterday. A gap resets the streak.
 */
export function computeStarsDayStreak(
  completionDays: readonly string[],
  todayLocalDay: string,
): number {
  const unique = [...new Set(completionDays.filter(Boolean))].sort();
  if (unique.length === 0) return 0;

  const daySet = new Set(unique);
  const parse = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  };
  const format = (ms: number) => {
    const date = new Date(ms);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const shift = (day: string, delta: number) =>
    format(parse(day) + delta * 86_400_000);

  let cursor = todayLocalDay;
  if (!daySet.has(cursor)) {
    cursor = shift(todayLocalDay, -1);
    if (!daySet.has(cursor)) return 0;
  }

  let streak = 0;
  while (daySet.has(cursor)) {
    streak += 1;
    cursor = shift(cursor, -1);
  }
  return streak;
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
