import { describe, expect, test } from "bun:test";
import {
  canMarkGoalComplete,
  developmentPlanSummary,
  goalProgress,
  isGoalStepComplete,
} from "./development-goal-progress";

describe("goalProgress", () => {
  test("supports legacy goals without completion fields", () => {
    expect(goalProgress({ steps: ["One", "Two"] })).toEqual({
      completedStepIndexes: [],
      completedStepCount: 0,
      totalStepCount: 2,
      progressPercent: 0,
      label: "0 of 2 actions",
    });
  });

  test("calculates real progress from completed indexes", () => {
    expect(
      goalProgress({
        steps: ["One", "Two", "Three"],
        completedStepIndexes: [0, 2],
      }),
    ).toMatchObject({
      completedStepCount: 2,
      totalStepCount: 3,
      progressPercent: 67,
      label: "2 of 3 actions",
    });
  });

  test("ignores invalid and duplicate indexes", () => {
    const result = goalProgress({
      steps: ["One", "Two"],
      completedStepIndexes: [1, 1, 4, -1],
    });
    expect(result.completedStepIndexes).toEqual([1]);
    expect(isGoalStepComplete(result, 1)).toBe(true);
  });

  test("handles zero-step goals", () => {
    expect(goalProgress({ steps: [] })).toMatchObject({
      progressPercent: 0,
      label: "No actions",
    });
  });

  test("only allows completion after every step is complete", () => {
    expect(
      canMarkGoalComplete({
        steps: ["One", "Two"],
        completedStepIndexes: [0],
      }),
    ).toBe(false);
    expect(
      canMarkGoalComplete({
        steps: ["One", "Two"],
        completedStepIndexes: [0, 1],
      }),
    ).toBe(true);
    expect(canMarkGoalComplete({ steps: [] })).toBe(false);
  });
});

describe("developmentPlanSummary", () => {
  test("counts active and closed goals separately", () => {
    expect(
      developmentPlanSummary([
        { status: "active", steps: ["a", "b"], completedStepIndexes: [0] },
        { status: "active", steps: ["a"], completedStepIndexes: [] },
        { status: "inactive", steps: ["a"], completedStepIndexes: [] },
        { status: "closed", steps: ["a"], completedStepIndexes: [] },
      ]),
    ).toEqual({ activeCount: 2, completedCount: 1, overallPercent: 40 });
  });

  test("weights progress by steps, not by goal", () => {
    expect(
      developmentPlanSummary([
        { status: "active", steps: ["a", "b", "c", "d"], completedStepIndexes: [0, 1, 2] },
        { status: "active", steps: ["a"], completedStepIndexes: [] },
      ]).overallPercent,
    ).toBe(60);
  });

  test("treats closed goals as fully complete", () => {
    expect(
      developmentPlanSummary([
        { status: "closed", steps: ["a", "b"], completedStepIndexes: [0] },
      ]).overallPercent,
    ).toBe(100);
  });

  test("reports zero for empty plans and step-less goals", () => {
    expect(developmentPlanSummary([])).toEqual({
      activeCount: 0,
      completedCount: 0,
      overallPercent: 0,
    });
    expect(
      developmentPlanSummary([{ status: "active", steps: [] }]),
    ).toEqual({ activeCount: 1, completedCount: 0, overallPercent: 0 });
  });
});
