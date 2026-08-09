import { describe, expect, test } from "bun:test";
import type { Task, TeamMember } from "@/lib/types";
import {
  countCompletedToday,
  countDueToday,
  countOverdue,
  personalHealthPercent,
  workspaceHealthPercent,
} from "./workspace-summary-metrics";

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Task",
    status: overrides.status ?? "todo",
    priority: overrides.priority ?? "medium",
    dueDate: overrides.dueDate ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    teamId: "team-1",
    creatorId: "owner",
    creator: { id: "owner", name: "Owner", email: "owner@example.com" },
    assignments: [],
    subtasks: [],
    ...overrides,
  };
}

function member(userId: string, role: TeamMember["role"] = "member"): TeamMember {
  return {
    id: `membership-${userId}`,
    role,
    userId,
    teamId: "team-1",
    joinedAt: "2026-08-01T12:00:00.000Z",
    user: { id: userId, name: userId, email: `${userId}@example.com` },
  };
}

const standards = { checkInRequired: true, goalsRequired: true };

describe("workspace summary task metrics", () => {
  const now = new Date(2026, 7, 7, 15, 30);
  const today = new Date(2026, 7, 7, 9).toISOString();
  const yesterday = new Date(2026, 7, 6, 23, 59).toISOString();
  const tomorrow = new Date(2026, 7, 8, 8).toISOString();

  test("counts only tasks completed during the local current day", () => {
    expect(
      countCompletedToday(
        [
          task({ id: "today", status: "done", completedAt: today }),
          task({ id: "yesterday", status: "done", completedAt: yesterday }),
          task({ id: "not-done", status: "todo", completedAt: today }),
        ],
        now,
      ),
    ).toBe(1);
  });

  test("keeps completed-today counts correct across a month and year boundary", () => {
    const januaryFirst = new Date(2027, 0, 1, 10);
    expect(
      countCompletedToday(
        [
          task({
            id: "new-year",
            status: "done",
            completedAt: new Date(2027, 0, 1, 1).toISOString(),
          }),
          task({
            id: "last-year",
            status: "done",
            completedAt: new Date(2026, 11, 31, 23, 59).toISOString(),
          }),
        ],
        januaryFirst,
      ),
    ).toBe(1);
  });

  test("counts active tasks due today and excludes completed tasks", () => {
    expect(
      countDueToday(
        [
          task({ id: "due", dueDate: today }),
          task({ id: "done", status: "done", dueDate: today }),
          task({ id: "later", dueDate: tomorrow }),
        ],
        now,
      ),
    ).toBe(1);
  });

  test("counts active tasks before today as overdue", () => {
    expect(
      countOverdue(
        [
          task({ id: "late", dueDate: yesterday }),
          task({ id: "today", dueDate: today }),
          task({ id: "done", status: "done", dueDate: yesterday }),
        ],
        now,
      ),
    ).toBe(1);
  });
});

describe("workspace summary health metrics", () => {
  test("builds personal health from only the member's available dimensions", () => {
    expect(
      personalHealthPercent({
        standards,
        stats: {
          activeTasks: 10,
          overdueTasks: 2,
          completedTasks: 4,
          streak: 1,
          standardsCompliance: {
            checkInStatus: "on_track",
            checkInActionText: "",
            goalsStatus: "missing_goals",
            goalsActionText: "",
            missingGoals: 1,
            statusBadge: "Needs active goals",
            goalsDisplay: "0 / 1",
            minimumActiveGoals: 1,
          },
        },
      }),
    ).toBe(60);
  });

  test("returns null when personal stats are unavailable", () => {
    expect(personalHealthPercent({ standards, stats: undefined })).toBeNull();
  });

  test("excludes owners and averages workspace task and compliance dimensions", () => {
    expect(
      workspaceHealthPercent({
        members: [member("owner", "owner"), member("a"), member("b")],
        standards,
        memberStats: {
          owner: { activeTasks: 100, overdueTasks: 100, completedTasks: 0, streak: 0 },
          a: {
            activeTasks: 6,
            overdueTasks: 2,
            completedTasks: 3,
            streak: 1,
            standardsCompliance: {
              checkInStatus: "on_track",
              checkInActionText: "",
              goalsStatus: "on_track",
              goalsActionText: "",
              missingGoals: 0,
              statusBadge: "On track",
              goalsDisplay: "1 / 1",
              minimumActiveGoals: 1,
            },
          },
          b: {
            activeTasks: 4,
            overdueTasks: 0,
            completedTasks: 2,
            streak: 1,
            standardsCompliance: {
              checkInStatus: "due_soon",
              checkInActionText: "",
              goalsStatus: "missing_goals",
              goalsActionText: "",
              missingGoals: 1,
              statusBadge: "Needs active goals",
              goalsDisplay: "0 / 1",
              minimumActiveGoals: 1,
            },
          },
        },
      }),
    ).toBe(77);
  });
});
