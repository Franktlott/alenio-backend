import { describe, expect, test } from "bun:test";
import {
  canAccessTask,
  resolveTaskCreationPolicy,
  taskVisibilityWhere,
  workspaceTaskWhere,
} from "./task-policy";

describe("web task policy parity", () => {
  test("members can only create forced-private self reminders", () => {
    const result = resolveTaskCreationPolicy({
      requestedKind: "reminder",
      creatorId: "member-1",
      creatorRole: "member",
      requestedAssigneeIds: ["other-member"],
      requestedIncognito: false,
      requestedIsJoint: true,
    });

    expect(result).toEqual({
      ok: true,
      classification: { kind: "reminder", momentumEligible: false },
      assigneeIds: ["member-1"],
      incognito: true,
      isJoint: false,
    });
  });

  test("members cannot create workspace tasks", () => {
    const result = resolveTaskCreationPolicy({
      requestedKind: "workspace_task",
      creatorId: "member-1",
      creatorRole: "member",
      requestedAssigneeIds: ["member-1"],
    });

    expect(result).toMatchObject({ ok: false, code: "TASK_LEADER_REQUIRED" });
  });

  test("personal and shared query predicates keep reminders private", () => {
    expect(taskVisibilityWhere("member-1")).toEqual({
      OR: [
        { kind: "workspace_task" },
        { kind: "reminder", creatorId: "member-1" },
      ],
    });
    expect(workspaceTaskWhere).toEqual({ kind: "workspace_task" });
    expect(canAccessTask({ kind: "reminder", creatorId: "member-1" }, "member-1")).toBe(true);
    expect(canAccessTask({ kind: "reminder", creatorId: "member-1" }, "member-2")).toBe(false);
  });
});
