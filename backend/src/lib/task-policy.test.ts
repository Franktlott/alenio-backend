import { describe, expect, test } from "bun:test";
import {
  canAccessTask,
  canMutateTask,
  REMINDER_PRIVATE,
  resolveTaskCreationPolicy,
  TASK_KIND_INVALID,
  TASK_LEADER_REQUIRED,
  taskVisibilityWhere,
  workspaceTaskClassificationForRole,
  workspaceTaskWhere,
} from "./task-policy";

describe("task creation policy", () => {
  test.each(["owner", "team_leader"])("%s may create eligible workspace tasks", (creatorRole) => {
    expect(
      resolveTaskCreationPolicy({
        requestedKind: "workspace_task",
        creatorId: "leader",
        creatorRole,
        requestedAssigneeIds: ["a", "b", "a"],
        requestedIsJoint: true,
      }),
    ).toEqual({
      ok: true,
      classification: { kind: "workspace_task", momentumEligible: true },
      assigneeIds: ["a", "b"],
      incognito: false,
      isJoint: true,
    });
  });

  test("members receive the stable leader-required error for workspace tasks", () => {
    expect(
      resolveTaskCreationPolicy({
        requestedKind: "workspace_task",
        creatorId: "member",
        creatorRole: "member",
      }),
    ).toEqual({
      ok: false,
      code: TASK_LEADER_REQUIRED,
      message: "Only workspace owners and team leaders can create workspace tasks",
    });
  });

  test("all active roles may create a forced private self-reminder", () => {
    for (const creatorRole of ["owner", "team_leader", "member"]) {
      expect(
        resolveTaskCreationPolicy({
          requestedKind: "reminder",
          creatorId: "creator",
          creatorRole,
          requestedAssigneeIds: ["someone-else"],
          requestedIncognito: false,
          requestedIsJoint: true,
        }),
      ).toEqual({
        ok: true,
        classification: { kind: "reminder", momentumEligible: false },
        assigneeIds: ["creator"],
        incognito: true,
        isJoint: false,
      });
    }
  });

  test("invalid kinds return a stable validation code", () => {
    expect(
      resolveTaskCreationPolicy({
        requestedKind: "private_task",
        creatorId: "member",
        creatorRole: "member",
      }),
    ).toMatchObject({ ok: false, code: TASK_KIND_INVALID });
  });
});

describe("reminder privacy policy", () => {
  const reminder = { kind: "reminder" as const, creatorId: "creator" };

  test("only the creator can read or mutate reminders, without leader override", () => {
    expect(canAccessTask(reminder, "creator")).toBe(true);
    expect(canMutateTask(reminder, "creator")).toBe(true);
    expect(canAccessTask(reminder, "leader")).toBe(false);
    expect(canMutateTask(reminder, "leader")).toBe(false);
    expect(REMINDER_PRIVATE).toBe("REMINDER_PRIVATE");
  });

  test("personal and shared query helpers encode the privacy boundary", () => {
    expect(taskVisibilityWhere("creator")).toEqual({
      OR: [
        { kind: "workspace_task" },
        { kind: "reminder", creatorId: "creator" },
      ],
    });
    expect(workspaceTaskWhere).toEqual({ kind: "workspace_task" });
  });

  test("direct workspace task creation requires a leader and snapshots eligibility", () => {
    expect(workspaceTaskClassificationForRole("owner")).toEqual({
      kind: "workspace_task",
      momentumEligible: true,
    });
    expect(() => workspaceTaskClassificationForRole("member")).toThrow(
      "Only workspace owners and team leaders can create workspace tasks",
    );
  });
});
