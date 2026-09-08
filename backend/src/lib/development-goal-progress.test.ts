import { describe, expect, test } from "bun:test";
import {
  canCloseDevelopmentGoal,
  developmentGoalProgress,
  isValidGoalStepIndex,
  parseCompletedStepDates,
  remapCompletedStepDates,
  remapCompletedStepIndexes,
  sanitizeCompletedStepIndexes,
  toggleCompletedStepDate,
  toggleCompletedStepIndex,
} from "./development-goal-progress";

describe("development goal progress", () => {
  test("legacy goals default to zero progress", () => {
    expect(developmentGoalProgress(undefined, 4)).toEqual({
      completedStepIndexes: [],
      completedStepCount: 0,
      totalStepCount: 4,
      progressPercent: 0,
    });
  });

  test("sanitizes duplicate and out-of-range indexes", () => {
    expect(sanitizeCompletedStepIndexes([3, 1, 1, -1, 7], 4)).toEqual([1, 3]);
  });

  test("calculates rounded progress", () => {
    expect(developmentGoalProgress("[0,2]", 3).progressPercent).toBe(67);
  });

  test("toggles a completed step", () => {
    expect(toggleCompletedStepIndex("[0]", 3, 2, true)).toEqual([0, 2]);
    expect(toggleCompletedStepIndex("[0,2]", 3, 0, false)).toEqual([2]);
  });

  test("validates requested step indexes", () => {
    expect(isValidGoalStepIndex(2, 3)).toBe(true);
    expect(isValidGoalStepIndex(3, 3)).toBe(false);
    expect(isValidGoalStepIndex(-1, 3)).toBe(false);
  });

  test("preserves completion when steps are reordered or removed", () => {
    expect(
      remapCompletedStepIndexes(
        ["Observe", "Lead", "Reflect"],
        ["Lead", "Reflect"],
        [1, 2],
      ),
    ).toEqual([0, 1]);
  });

  test("saves, removes, and remaps step completion dates", () => {
    const completedAt = new Date("2026-08-09T21:00:00.000Z");
    const saved = toggleCompletedStepDate("{}", 1, true, completedAt);
    expect(saved).toEqual({ 1: completedAt.toISOString() });
    expect(parseCompletedStepDates(JSON.stringify(saved))).toEqual(saved);
    expect(
      remapCompletedStepDates(
        ["Observe", "Lead"],
        ["Lead", "Observe"],
        saved,
      ),
    ).toEqual({ 0: completedAt.toISOString() });
    expect(
      toggleCompletedStepDate(JSON.stringify(saved), 1, false, completedAt),
    ).toEqual({});
  });

  test("zero-step goals remain at zero", () => {
    expect(developmentGoalProgress("[0]", 0)).toEqual({
      completedStepIndexes: [],
      completedStepCount: 0,
      totalStepCount: 0,
      progressPercent: 0,
    });
  });

  test("requires every step before a goal can close", () => {
    expect(canCloseDevelopmentGoal("[0]", 2)).toBe(false);
    expect(canCloseDevelopmentGoal("[0,1]", 2)).toBe(true);
    expect(canCloseDevelopmentGoal("[]", 0)).toBe(false);
  });
});
