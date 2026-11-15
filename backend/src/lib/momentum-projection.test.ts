import { describe, expect, test } from "bun:test";
import {
  isStarsMilestone,
  nextStarsMilestone,
  previousStarsMilestone,
  projectMomentum,
  starsMilestoneSegment,
  type MomentumOutcome,
} from "./momentum-projection";

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const outcome = (day: number, onTime: boolean, id = String(day)): MomentumOutcome => ({
  id,
  completedAt: at(day),
  onTime,
});

describe("projectMomentum (Stars)", () => {
  test("counts every credit including late completions", () => {
    const projection = projectMomentum([
      outcome(1, true),
      outcome(2, true),
      outcome(3, false),
      outcome(4, true),
    ]);

    expect(projection).toEqual({
      currentStreak: 4,
      personalBestStreak: 4,
      momentumRunStartedAt: at(1),
      momentumLastQualifiedAt: at(4),
    });
  });

  test("a newest late completion still counts as a star", () => {
    expect(projectMomentum([outcome(1, true), outcome(20, true), outcome(27, false)])).toEqual({
      currentStreak: 3,
      personalBestStreak: 3,
      momentumRunStartedAt: at(1),
      momentumLastQualifiedAt: at(27),
    });
  });

  test("returns an empty projection without evidence", () => {
    expect(projectMomentum([])).toEqual({
      currentStreak: 0,
      personalBestStreak: 0,
      momentumRunStartedAt: null,
      momentumLastQualifiedAt: null,
    });
  });
});

describe("stars milestones", () => {
  test("next milestone thresholds", () => {
    expect(nextStarsMilestone(0)).toBe(5);
    expect(nextStarsMilestone(4)).toBe(5);
    expect(nextStarsMilestone(5)).toBe(10);
    expect(nextStarsMilestone(9)).toBe(10);
    expect(nextStarsMilestone(15)).toBe(20);
    expect(nextStarsMilestone(21)).toBe(30);
  });

  test("segment for hollow to filled path", () => {
    expect(starsMilestoneSegment(7)).toEqual({
      currentStars: 7,
      nextMilestone: 10,
      previousMilestone: 5,
      filledInSegment: 2,
      segmentSize: 5,
      remainingToMilestone: 3,
    });
    expect(previousStarsMilestone(0)).toBe(0);
    expect(isStarsMilestone(5)).toBe(true);
    expect(isStarsMilestone(7)).toBe(false);
  });
});
