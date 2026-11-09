import { describe, expect, test } from "bun:test";
import { TASK_NUDGE_COOLDOWN_MS, checkTaskNudge, taskNudgeBody } from "./task-nudge";

const now = Date.parse("2026-11-08T12:00:00Z");
const task = { kind: "workspace_task", status: "todo", archivedAt: null, assigneeIds: ["u2"] };
const base = { actorUserId: "u1", actorRole: "owner", targetUserId: "u2", task, lastNudgedAt: undefined, now };

describe("checkTaskNudge", () => {
  test("owners and team leaders can nudge an assignee", () => {
    expect(checkTaskNudge(base)).toEqual({ ok: true });
    expect(checkTaskNudge({ ...base, actorRole: "team_leader" })).toEqual({ ok: true });
  });

  test("members cannot nudge", () => {
    expect(checkTaskNudge({ ...base, actorRole: "member" })).toMatchObject({ ok: false, status: 403 });
  });

  test("private reminders and finished tasks cannot be nudged", () => {
    expect(checkTaskNudge({ ...base, task: { ...task, kind: "reminder" } })).toMatchObject({ ok: false, status: 400 });
    expect(checkTaskNudge({ ...base, task: { ...task, status: "done" } })).toMatchObject({ code: "TASK_COMPLETED" });
    expect(checkTaskNudge({ ...base, task: { ...task, archivedAt: new Date(now) } })).toMatchObject({ code: "TASK_COMPLETED" });
  });

  test("only people on the task, and never yourself", () => {
    expect(checkTaskNudge({ ...base, targetUserId: "u3" })).toMatchObject({ code: "NOT_ASSIGNED" });
    expect(checkTaskNudge({ ...base, targetUserId: "u1", task: { ...task, assigneeIds: ["u1"] } })).toMatchObject({
      code: "NUDGE_SELF",
    });
  });

  test("one nudge per task and person per cooldown window", () => {
    expect(checkTaskNudge({ ...base, lastNudgedAt: now - 60_000 })).toMatchObject({ ok: false, status: 429 });
    expect(checkTaskNudge({ ...base, lastNudgedAt: now - TASK_NUDGE_COOLDOWN_MS })).toEqual({ ok: true });
  });
});

describe("taskNudgeBody", () => {
  test("mentions overdue tasks", () => {
    expect(taskNudgeBody("Frank Lott", "Restock", new Date(now - 1000), new Date(now))).toBe(
      "Frank Lott is checking in on an overdue task: Restock",
    );
    expect(taskNudgeBody(null, "Restock", null, new Date(now))).toBe("Your team leader sent a reminder: Restock");
  });
});
