import { describe, expect, test } from "bun:test";
import {
  buildStarsJourney,
  isStarsMilestone,
  nextStarsMilestone,
  starsMilestoneSegment,
} from "./stars";

describe("stars ladder (5/10/20/50)", () => {
  test("next milestone thresholds", () => {
    expect(nextStarsMilestone(0)).toBe(5);
    expect(nextStarsMilestone(12)).toBe(20);
    expect(nextStarsMilestone(50)).toBe(100);
    expect(isStarsMilestone(15)).toBe(false);
    expect(isStarsMilestone(20)).toBe(true);
  });

  test("segment math", () => {
    expect(starsMilestoneSegment(12)).toMatchObject({
      nextMilestone: 20,
      previousMilestone: 10,
      filledInSegment: 2,
      segmentSize: 10,
      remainingToMilestone: 8,
    });
  });
});

describe("buildStarsJourney status", () => {
  test("completed / active / locked from a star count", () => {
    const journey = buildStarsJourney(12);
    expect(
      journey.map((step) => ({
        title: step.title,
        status: step.status,
        progress: `${step.progressCurrent}/${step.progressTarget}`,
      })),
    ).toEqual([
      { title: "Getting Started", status: "completed", progress: "5/5" },
      { title: "Finding Your Rhythm", status: "completed", progress: "10/10" },
      { title: "Building Momentum", status: "active", progress: "12/20" },
      { title: "Going Further", status: "locked", progress: "12/50" },
    ]);
  });

  test("empty starts on Getting Started", () => {
    expect(buildStarsJourney(0)[0]).toMatchObject({
      title: "Getting Started",
      status: "active",
      progressCurrent: 0,
      progressTarget: 5,
    });
  });
});
