import { describe, expect, test } from "bun:test";
import {
  completedByOtherMember,
  incompleteSubtasks,
  isSubtaskSharedComplete,
} from "./subtask-completion";

describe("shared subtask completion", () => {
  test("one person's checkoff closes the subtask for everyone", () => {
    expect(
      isSubtaskSharedComplete({
        completed: false,
        completions: [{ userId: "a" }],
      }),
    ).toBe(true);
  });

  test("completed flag is enough even without per-user records", () => {
    expect(isSubtaskSharedComplete({ completed: true, completions: [] })).toBe(true);
  });

  test("lists only open subtasks", () => {
    const open = incompleteSubtasks([
      { title: "Done", completed: true, completions: [] },
      { title: "Covered by teammate", completed: false, completions: [{ userId: "b" }] },
      { title: "Still open", completed: false, completions: [] },
    ]);
    expect(open.map((item) => item.title)).toEqual(["Still open"]);
  });

  test("unchecking your own step does not need confirmation", () => {
    expect(
      completedByOtherMember(
        { completed: true, completions: [{ userId: "me", user: { name: "Me" } }] },
        "me",
      ),
    ).toBeNull();
  });

  test("unchecking a teammate's step needs confirmation", () => {
    expect(
      completedByOtherMember(
        { completed: true, completions: [{ userId: "other", user: { name: "Frank" } }] },
        "me",
      ),
    ).toEqual({ userId: "other", name: "Frank" });
  });
});
