import { describe, expect, test } from "bun:test";
import { isSubtaskSharedComplete } from "./subtask-completion";

describe("shared subtask completion", () => {
  test("one completion is enough to close a joint subtask", () => {
    expect(isSubtaskSharedComplete({ completed: false, completionCount: 1 })).toBe(true);
  });

  test("the completed flag is enough without per-user records", () => {
    expect(isSubtaskSharedComplete({ completed: true, completionCount: 0 })).toBe(true);
  });

  test("open when nobody has finished it", () => {
    expect(isSubtaskSharedComplete({ completed: false, completionCount: 0 })).toBe(false);
  });
});
