import { describe, expect, test } from "bun:test";
import {
  isTaskKind,
  LEGACY_TASK_CLASSIFICATION,
  TASK_KINDS,
} from "./task-kind";

describe("task kinds", () => {
  test("exposes only the durable contract values", () => {
    expect(TASK_KINDS).toEqual(["workspace_task", "reminder"]);
    expect(isTaskKind("workspace_task")).toBe(true);
    expect(isTaskKind("reminder")).toBe(true);
    expect(isTaskKind("personal_task")).toBe(false);
  });

  test("uses the safe legacy classification", () => {
    expect(LEGACY_TASK_CLASSIFICATION).toEqual({
      kind: "workspace_task",
      momentumEligible: false,
    });
    expect(Object.isFrozen(LEGACY_TASK_CLASSIFICATION)).toBe(true);
  });
});
