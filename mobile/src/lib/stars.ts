/** Client helpers for the Stars product (replaces Momentum bands). */

export type StarsJourneyIconKey = "star" | "bolt" | "mountain" | "trophy";

export type StarsJourneyCatalogEntry = {
  id: string;
  threshold: number;
  title: string;
  iconKey: StarsJourneyIconKey;
};

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

/** Named journey milestones from the Stars mockup. */
export const STARS_JOURNEY_CATALOG: readonly StarsJourneyCatalogEntry[] = [
  { id: "getting-started", threshold: 5, title: "Getting Started", iconKey: "star" },
  { id: "finding-rhythm", threshold: 10, title: "Finding Your Rhythm", iconKey: "bolt" },
  { id: "building-momentum", threshold: 20, title: "Building Momentum", iconKey: "mountain" },
  { id: "going-further", threshold: 50, title: "Going Further", iconKey: "trophy" },
] as const;

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
        status: "completed" as const,
        progressCurrent: entry.threshold,
        progressTarget: entry.threshold,
      };
    }
    const previous = previousStarsMilestone(entry.threshold - 1);
    const active = currentStars >= previous && currentStars < entry.threshold;
    return {
      id: entry.id,
      threshold: entry.threshold,
      title: entry.title,
      iconKey: entry.iconKey,
      status: (active ? "active" : "locked") as StarsJourneyStatus,
      progressCurrent: Math.min(currentStars, entry.threshold),
      progressTarget: entry.threshold,
    };
  });

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

/** Cap the hero segment star row so large ladders stay readable. */
export function starsHeroSegmentDisplay(stars: number): {
  displaySize: number;
  displayFilled: number;
} {
  const { filledInSegment, segmentSize } = starsMilestoneSegment(stars);
  const displaySize = Math.min(segmentSize, 10);
  const displayFilled = Math.round((filledInSegment / segmentSize) * displaySize);
  return { displaySize, displayFilled };
}

export const STARS_GOLD = "#C9A227";
export const STARS_NAVY = "#0F172A";
/** Matches theme `palette.violet` / `colors.brand`. */
export const STARS_PURPLE = "#6d28d9";
export const STARS_INDIGO = "#1a0b45";
