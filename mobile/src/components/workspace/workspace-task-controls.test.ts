import { describe, expect, test } from "bun:test";
import { DEFAULT_WORKSPACE_FILTERS, type WorkspaceFiltersState } from "./workspace-types";
import {
  countActiveTaskFilters,
  taskFilterSummary,
  taskStatusLabel,
} from "./workspace-utils";

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
