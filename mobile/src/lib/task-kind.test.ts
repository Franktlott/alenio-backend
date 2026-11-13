// @ts-expect-error Bun supplies this module at test runtime; mobile tsc excludes Bun types.
import { describe, expect, test } from "bun:test";
import {
  parseTaskKind,
  resolveTaskCreationPresentation,
  mergeViewerReminders,
  ownerCompletingUnassignedTask,
  workspaceTasksOnly,
} from "@/lib/task-kind";
import type { Task } from "@/lib/types";

describe("task kind presentation", () => {
  test("defaults leaders to workspace tasks and honors a private task route", () => {
    expect(resolveTaskCreationPresentation("owner").kind).toBe(
      "workspace_task",
    );
    expect(
      resolveTaskCreationPresentation("team_leader", "reminder"),
    ).toMatchObject({
      kind: "reminder",
      canChooseKind: true,
      createLabel: "Create Task",
      audienceLabel: "Just for me",
      privacyHint: "Only you can see this",
    });
  });

  test("forces members and legacy admins into the private task flow", () => {
    expect(
      resolveTaskCreationPresentation("member", "workspace_task"),
    ).toMatchObject({
      kind: "reminder",
      canChooseKind: false,
      newTitle: "New Task",
      privacyHint: "Only you can see this",
    });
    expect(resolveTaskCreationPresentation("admin").kind).toBe("reminder");
  });

  test("parses only supported route values", () => {
    expect(parseTaskKind("reminder")).toBe("reminder");
    expect(parseTaskKind(["workspace_task"])).toBe("workspace_task");
    expect(parseTaskKind("task")).toBeUndefined();
  });

  test("removes reminders from workspace-wide surfaces", () => {
    const tasks = [
      { id: "workspace", kind: "workspace_task" },
      { id: "private", kind: "reminder" },
      { id: "legacy" },
    ] as Task[];
    expect(workspaceTasksOnly(tasks).map((task) => task.id)).toEqual([
      "workspace",
      "legacy",
    ]);
  });

  test("merges the viewer's reminders into a workspace list once", () => {
    const tasks = [
      { id: "workspace", kind: "workspace_task" },
      { id: "already", kind: "reminder" },
    ] as Task[];
    const reminders = [
      { id: "already", kind: "reminder" },
      { id: "private", kind: "reminder" },
      { id: "not-a-reminder", kind: "workspace_task" },
    ] as Task[];
    expect(mergeViewerReminders(tasks, reminders).map((task) => task.id)).toEqual([
      "workspace",
      "already",
      "private",
    ]);
  });

  test("warns an owner who is completing a task that is not assigned to them", () => {
    const someoneElses = {
      kind: "workspace_task",
      status: "todo",
      assignments: [{ userId: "member" }],
    };
    expect(ownerCompletingUnassignedTask("owner", "owner", someoneElses)).toBe(true);
    expect(
      ownerCompletingUnassignedTask("owner", "owner", {
        kind: "workspace_task",
        status: "todo",
        assignments: [],
      }),
    ).toBe(true);
    expect(
      ownerCompletingUnassignedTask("owner", "owner", {
        ...someoneElses,
        assignments: [{ userId: "owner" }],
      }),
    ).toBe(false);
    expect(ownerCompletingUnassignedTask("team_leader", "leader", someoneElses)).toBe(false);
    expect(
      ownerCompletingUnassignedTask("owner", "owner", {
        kind: "reminder",
        status: "todo",
        assignments: [],
      }),
    ).toBe(false);
    expect(
      ownerCompletingUnassignedTask("owner", "owner", { ...someoneElses, status: "done" }),
    ).toBe(false);
  });
});
