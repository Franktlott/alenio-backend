import { describe, expect, test } from "bun:test";
import {
  canCreateWorkspaceTask,
  isPrivateReminder,
  resolveCreateTaskKind,
  taskNoun,
} from "./task-presentation";

describe("web task presentation policy", () => {
  test("leaders can choose workspace tasks or reminders", () => {
    expect(canCreateWorkspaceTask("owner")).toBe(true);
    expect(canCreateWorkspaceTask("team_leader")).toBe(true);
    expect(resolveCreateTaskKind("owner")).toBe("workspace_task");
    expect(resolveCreateTaskKind("team_leader", "reminder")).toBe("reminder");
  });

  test("members always get private reminder creation", () => {
    expect(canCreateWorkspaceTask("member")).toBe(false);
    expect(resolveCreateTaskKind("member", "workspace_task")).toBe("reminder");
  });

  test("reminders use distinct, subtle copy", () => {
    const reminder = { kind: "reminder" };
    expect(isPrivateReminder(reminder)).toBe(true);
    expect(taskNoun(reminder)).toBe("reminder");
    expect(taskNoun({ kind: "workspace_task" })).toBe("task");
    expect(isPrivateReminder({})).toBe(false);
    expect(taskNoun({})).toBe("task");
  });
});
