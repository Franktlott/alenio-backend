/** Client helpers for the Stars product (replaces Momentum bands). */

export function nextStarsMilestone(stars: number): number {
  const value = Math.max(0, Math.floor(stars));
  if (value < 5) return 5;
  if (value < 10) return 10;
  if (value < 15) return 15;
  return Math.floor(value / 10) * 10 + 10;
}

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

export const STARS_GOLD = "#C9A227";
export const STARS_NAVY = "#0F172A";
