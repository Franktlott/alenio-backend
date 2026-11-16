import { describe, expect, test } from "bun:test";
import {
  buildStarsJourney,
  computeStarsDayStreak,
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

describe("stars milestones (5/10/20/50)", () => {
  test("next milestone thresholds", () => {
    expect(nextStarsMilestone(0)).toBe(5);
    expect(nextStarsMilestone(4)).toBe(5);
    expect(nextStarsMilestone(5)).toBe(10);
    expect(nextStarsMilestone(9)).toBe(10);
    expect(nextStarsMilestone(12)).toBe(20);
    expect(nextStarsMilestone(20)).toBe(50);
    expect(nextStarsMilestone(49)).toBe(50);
    expect(nextStarsMilestone(50)).toBe(100);
    expect(nextStarsMilestone(100)).toBe(150);
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
    expect(starsMilestoneSegment(12)).toEqual({
      currentStars: 12,
      nextMilestone: 20,
      previousMilestone: 10,
      filledInSegment: 2,
      segmentSize: 10,
      remainingToMilestone: 8,
    });
    expect(previousStarsMilestone(0)).toBe(0);
    expect(isStarsMilestone(5)).toBe(true);
    expect(isStarsMilestone(20)).toBe(true);
    expect(isStarsMilestone(50)).toBe(true);
    expect(isStarsMilestone(100)).toBe(true);
    expect(isStarsMilestone(15)).toBe(false);
    expect(isStarsMilestone(7)).toBe(false);
  });
});

describe("buildStarsJourney", () => {
  test("marks completed / active / locked from a star count", () => {
    const journey = buildStarsJourney(12);
    expect(journey.map((step) => ({ title: step.title, status: step.status, progress: `${step.progressCurrent}/${step.progressTarget}` }))).toEqual([
      { title: "Getting Started", status: "completed", progress: "5/5" },
      { title: "Finding Your Rhythm", status: "completed", progress: "10/10" },
      { title: "Building Momentum", status: "active", progress: "12/20" },
      { title: "Going Further", status: "locked", progress: "12/50" },
    ]);
  });

  test("starts at Getting Started when empty", () => {
    const journey = buildStarsJourney(0);
    expect(journey[0]).toMatchObject({
      title: "Getting Started",
      status: "active",
      progressCurrent: 0,
      progressTarget: 5,
    });
  });

  test("continues past 50 in +50 steps", () => {
    const journey = buildStarsJourney(75);
    expect(journey.at(-1)).toMatchObject({
      threshold: 100,
      title: "Going Further +",
      status: "active",
      progressCurrent: 75,
      progressTarget: 100,
    });
  });
});

describe("computeStarsDayStreak", () => {
  test("counts consecutive days ending today", () => {
    expect(
      computeStarsDayStreak(
        ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-15"],
        "2026-11-15",
      ),
    ).toBe(3);
  });

  test("same day multiple completions still count as one day", () => {
    expect(
      computeStarsDayStreak(["2026-11-15", "2026-11-15", "2026-11-15"], "2026-11-15"),
    ).toBe(1);
  });

  test("allows streak ending yesterday", () => {
    expect(
      computeStarsDayStreak(["2026-11-13", "2026-11-14"], "2026-11-15"),
    ).toBe(2);
  });

  test("gap resets the streak", () => {
    expect(
      computeStarsDayStreak(["2026-11-10", "2026-11-12", "2026-11-15"], "2026-11-15"),
    ).toBe(1);
  });

  test("returns 0 when last completion is older than yesterday", () => {
    expect(computeStarsDayStreak(["2026-11-10"], "2026-11-15")).toBe(0);
  });
});
