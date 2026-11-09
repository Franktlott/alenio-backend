import { describe, expect, test } from "bun:test";
import { DEFAULT_WORKSPACE_FILTERS, type WorkspaceFiltersState } from "./workspace-types";
import type { Task } from "@/lib/types";
import {
  countActiveTaskFilters,
  formatTaskDueCopy,
  groupTasksBySchedule,
  taskFilterSummary,
  taskScopeChip,
  taskStatusLabel,
} from "./workspace-utils";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    status: "todo",
    priority: "medium",
    kind: "workspace_task",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    teamId: "team-1",
    creatorId: "user-1",
    creator: { id: "user-1", name: "Pat", email: "pat@example.com" },
    assignments: [],
    subtasks: [],
    ...partial,
  };
}

describe("taskStatusLabel", () => {
  test("names each task state for the Showing selector", () => {
    expect(taskStatusLabel("active")).toBe("Active Tasks");
    expect(taskStatusLabel("completed")).toBe("Completed Tasks");
    expect(taskStatusLabel("archived")).toBe("Archived Tasks");
    expect(taskStatusLabel("all")).toBe("All Tasks");
  });
});

describe("taskFilterSummary", () => {
  test("uses the view name for default filters", () => {
    expect(taskFilterSummary(DEFAULT_WORKSPACE_FILTERS, null)).toBe("Active Tasks");
  });

  test("surfaces the most useful active filter in the toolbar", () => {
    expect(
      taskFilterSummary(
        { ...DEFAULT_WORKSPACE_FILTERS, dueDate: "today" },
        null,
      ),
    ).toBe("Active Tasks • Today");
    expect(
      taskFilterSummary(
        {
          ...DEFAULT_WORKSPACE_FILTERS,
          statusTab: "completed",
          priority: "high",
        },
        null,
      ),
    ).toBe("Completed • High Priority");
  });

  test("prioritizes a specific assignee", () => {
    expect(
      taskFilterSummary(
        {
          ...DEFAULT_WORKSPACE_FILTERS,
          assignedTo: { memberId: "mike", memberName: "Mike" },
        },
        null,
      ),
    ).toBe("Assigned to Mike");
  });
});

describe("countActiveTaskFilters", () => {
  test("is zero for the default filters", () => {
    expect(countActiveTaskFilters(DEFAULT_WORKSPACE_FILTERS, null)).toBe(0);
  });

  test("counts a non-default due date", () => {
    expect(
      countActiveTaskFilters({ ...DEFAULT_WORKSPACE_FILTERS, dueDate: "overdue" }, null),
    ).toBe(1);
  });

  test("counts a non-default priority", () => {
    expect(
      countActiveTaskFilters({ ...DEFAULT_WORKSPACE_FILTERS, priority: "high" }, null),
    ).toBe(1);
  });

  test("counts due date and priority together", () => {
    expect(
      countActiveTaskFilters(
        { ...DEFAULT_WORKSPACE_FILTERS, dueDate: "today", priority: "urgent" },
        null,
      ),
    ).toBe(2);
  });

  test("counts a calendar day selection", () => {
    expect(
      countActiveTaskFilters(
        { ...DEFAULT_WORKSPACE_FILTERS, dueDate: "calendar_day" },
        "2026-08-07",
      ),
    ).toBe(1);
  });

  test("counts only due date and priority", () => {
    const filters: WorkspaceFiltersState = {
      ...DEFAULT_WORKSPACE_FILTERS,
      assignedTo: "entire_team",
      sort: "priority",
    };
    expect(countActiveTaskFilters(filters, null)).toBe(0);
  });
});

describe("taskScopeChip", () => {
  test("maps filter state onto the Tasks tab chips", () => {
    expect(taskScopeChip(DEFAULT_WORKSPACE_FILTERS)).toBe("mine");
    expect(
      taskScopeChip({ ...DEFAULT_WORKSPACE_FILTERS, assignedTo: "entire_team" }),
    ).toBe("all");
    expect(
      taskScopeChip({ ...DEFAULT_WORKSPACE_FILTERS, assignedTo: "others" }),
    ).toBe("assigned");
    expect(
      taskScopeChip({ ...DEFAULT_WORKSPACE_FILTERS, statusTab: "completed" }),
    ).toBe("completed");
  });
});

describe("formatTaskDueCopy", () => {
  const now = new Date("2026-09-04T15:00:00");

  test("labels today, tomorrow, and overdue due dates", () => {
    expect(formatTaskDueCopy("2026-09-04T16:00:00", now).tone).toBe("today");
    expect(formatTaskDueCopy("2026-09-04T16:00:00", now).text.startsWith("Today")).toBe(true);
    expect(formatTaskDueCopy("2026-09-05T09:00:00", now).tone).toBe("upcoming");
    expect(formatTaskDueCopy("2026-09-03T17:00:00", now).tone).toBe("overdue");
    expect(formatTaskDueCopy("2026-09-04T14:00:00", now).tone).toBe("overdue");
  });
});

describe("groupTasksBySchedule", () => {
  test("buckets tasks into overdue, today, and upcoming", () => {
    const now = new Date("2026-09-04T12:00:00");
    const groups = groupTasksBySchedule(
      [
        task({ id: "1", title: "Overdue", dueDate: "2026-09-03T17:00:00" }),
        task({ id: "2", title: "Today", dueDate: "2026-09-04T16:00:00" }),
        task({ id: "4", title: "Past time", dueDate: "2026-09-04T10:00:00" }),
        task({ id: "3", title: "Later", dueDate: "2026-09-09T10:00:00" }),
      ],
      now,
    );
    expect(groups.map((group) => [group.key, group.tasks.length])).toEqual([
      ["overdue", 2],
      ["today", 1],
      ["upcoming", 1],
    ]);
  });
});
