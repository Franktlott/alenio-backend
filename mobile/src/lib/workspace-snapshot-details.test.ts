import { describe, expect, test } from "bun:test";
import type { CalendarEvent, Task, TeamMember } from "@/lib/types";
import {
  buildGoalCoverageItems,
  oneOnOneStatus,
  selectSnapshotTasks,
  selectTodaysOneOnOnes,
  snapshotAttentionReason,
} from "./workspace-snapshot-details";

function member(id: string, name: string, role: TeamMember["role"] = "member"): TeamMember {
  return {
    id: `membership-${id}`,
    role,
    userId: id,
    teamId: "team-1",
    joinedAt: "2026-08-01T12:00:00.000Z",
    user: { id, name, email: `${id}@example.com` },
  };
}

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

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: overrides.id ?? "event-1",
    title: overrides.title ?? "Check-in",
    startDate: overrides.startDate ?? new Date(2026, 7, 9, 10).toISOString(),
    endDate: overrides.endDate ?? new Date(2026, 7, 9, 11).toISOString(),
    allDay: false,
    color: "#4361EE",
    teamId: "team-1",
    createdAt: "2026-08-01T12:00:00.000Z",
    isOneOnOne: true,
    ...overrides,
  };
}

describe("snapshot task details", () => {
  const now = new Date(2026, 7, 9, 12);
  const today = new Date(2026, 7, 9, 9).toISOString();
  const yesterday = new Date(2026, 7, 8, 23, 59).toISOString();

  test("returns the exact active due-today and overdue lists", () => {
    const tasks = [
      task({ id: "today", dueDate: today }),
      task({ id: "late", dueDate: yesterday }),
      task({ id: "done", status: "done", dueDate: today, completedAt: today }),
      task({ id: "undated" }),
    ];
    expect(selectSnapshotTasks(tasks, "dueToday", now).map((item) => item.id)).toEqual(["today"]);
    expect(selectSnapshotTasks(tasks, "overdue", now).map((item) => item.id)).toEqual(["late"]);
  });

  test("uses completion time, not due time, for completed today", () => {
    const tasks = [
      task({ id: "completed", status: "done", dueDate: yesterday, completedAt: today }),
      task({ id: "older", status: "done", completedAt: yesterday }),
    ];
    expect(selectSnapshotTasks(tasks, "completedToday", now).map((item) => item.id)).toEqual(["completed"]);
  });
});

describe("snapshot scheduled details", () => {
  const now = new Date(2026, 7, 9, 12);

  test("returns only today's actual one-on-ones in time order", () => {
    const events = [
      event({ id: "later", startDate: new Date(2026, 7, 9, 15).toISOString() }),
      event({ id: "earlier", startDate: new Date(2026, 7, 9, 9).toISOString() }),
      event({ id: "other", isOneOnOne: false }),
      event({ id: "tomorrow", startDate: new Date(2026, 7, 10, 9).toISOString() }),
    ];
    expect(selectTodaysOneOnOnes(events, now).map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  test("labels upcoming, active, and completed check-ins", () => {
    expect(oneOnOneStatus(event({ startDate: new Date(2026, 7, 9, 13).toISOString() }), now)).toBe("Upcoming");
    expect(
      oneOnOneStatus(
        event({
          startDate: new Date(2026, 7, 9, 11).toISOString(),
          endDate: new Date(2026, 7, 9, 13).toISOString(),
        }),
        now,
      ),
    ).toBe("In progress");
    expect(oneOnOneStatus(event({ endDate: new Date(2026, 7, 9, 11).toISOString() }), now)).toBe("Completed");
  });
});

test("attention copy includes every real reason", () => {
  expect(
    snapshotAttentionReason(
      {
        activeTasks: 4,
        overdueTasks: 2,
        completedTasks: 1,
        streak: 0,
        daysSinceLastOneOnOne: 40,
        standardsCompliance: {
          checkInStatus: "overdue",
          checkInActionText: "Schedule now",
          goalsStatus: "missing_goals",
          goalsActionText: "Add goals",
          missingGoals: 1,
          statusBadge: "Overdue check-in",
          goalsDisplay: "1 / 2",
          minimumActiveGoals: 2,
        },
      },
      { checkInRequired: true, goalsRequired: true },
    ),
  ).toBe("2 tasks overdue · Check-in overdue · 1 goal missing");
});

describe("goal coverage details", () => {
  test("calculates capped requirement coverage and excludes owners", () => {
    const items = buildGoalCoverageItems({
      members: [
        member("owner", "Owner", "owner"),
        member("one", "One Goal"),
        member("three", "Three Goals"),
      ],
      minimumActiveGoals: 2,
      memberStats: {
        one: { activeTasks: 0, overdueTasks: 0, completedTasks: 0, streak: 0, activeDevGoals: 1 },
        three: { activeTasks: 0, overdueTasks: 0, completedTasks: 0, streak: 0, activeDevGoals: 3 },
      },
    });
    expect(items.map((item) => ({
      id: item.member.userId,
      percentage: item.percentage,
      missing: item.missingGoals,
    }))).toEqual([
      { id: "one", percentage: 50, missing: 1 },
      { id: "three", percentage: 100, missing: 0 },
    ]);
  });

  test("sorts members needing goals first and then alphabetically", () => {
    const items = buildGoalCoverageItems({
      members: [member("z", "Zara"), member("a", "Avery"), member("b", "Blake")],
      minimumActiveGoals: 2,
      memberStats: {
        z: { activeTasks: 0, overdueTasks: 0, completedTasks: 0, streak: 0, activeDevGoals: 2 },
        a: { activeTasks: 0, overdueTasks: 0, completedTasks: 0, streak: 0, activeDevGoals: 1 },
        b: { activeTasks: 0, overdueTasks: 0, completedTasks: 0, streak: 0, activeDevGoals: 1 },
      },
    });
    expect(items.map((item) => item.member.user.name)).toEqual(["Avery", "Blake", "Zara"]);
  });
});
