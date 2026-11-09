import { describe, expect, test } from "bun:test";
import {
  compareAgendaOrder,
  datedItemLocalIso,
  dayHasDotActivity,
  dayHasVisibleActivity,
  dedupeDatedTasksAgainstEvents,
  sundayMonthWeeks,
} from "./calendar-month-view";
import type { CalendarEvent, Task } from "./types";

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "startDate">): CalendarEvent {
  return {
    allDay: false,
    color: "#4361EE",
    teamId: "team",
    createdAt: "2026-01-01T00:00:00.000Z",
    endDate: null,
    ...partial,
  };
}

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    status: "todo",
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    teamId: "team",
    creatorId: "u1",
    creator: { id: "u1", name: "Ada", email: "ada@example.com" },
    assignments: [],
    subtasks: [],
    ...partial,
  };
}

describe("sundayMonthWeeks", () => {
  test("pads a four-week month to five rows", () => {
    // February 2015 starts on Sunday and has 28 days.
    expect(sundayMonthWeeks(2015, 1)).toHaveLength(5);
  });

  test("uses five weeks for a typical month", () => {
    expect(sundayMonthWeeks(2026, 8)).toHaveLength(5);
  });

  test("uses six weeks when the month spills into a sixth row", () => {
    // May 2021 starts on Saturday.
    expect(sundayMonthWeeks(2021, 4)).toHaveLength(6);
  });

  test("keeps seven equal columns in every row", () => {
    for (const week of sundayMonthWeeks(2026, 8)) {
      expect(week).toHaveLength(7);
    }
  });
});

describe("datedItemLocalIso", () => {
  test("keeps UTC midnight date-only values on the stated calendar day", () => {
    expect(datedItemLocalIso("2026-09-12T00:00:00.000Z")).toBe("2026-09-12");
    expect(datedItemLocalIso("2026-09-12")).toBe("2026-09-12");
  });
});

describe("activity dots", () => {
  const holiday = { name: "Labor Day", date: new Date(2026, 8, 7) };

  test("one busy date with mixed types still counts as activity", () => {
    const busy = dayHasVisibleActivity({
      iso: "2026-09-12",
      events: [
        event({
          id: "e1",
          title: "Team briefing",
          startDate: "2026-09-12T14:00:00",
          endDate: "2026-09-12T14:30:00",
        }),
      ],
      tasks: [task({ id: "t1", title: "Prep notes", dueDate: "2026-09-12T23:59:00" })],
      holidays: [holiday],
    });
    expect(busy).toBe(true);
  });

  test("holidays count as activity", () => {
    expect(
      dayHasVisibleActivity({
        iso: "2026-09-07",
        events: [],
        tasks: [],
        holidays: [holiday],
      }),
    ).toBe(true);
  });

  test("events and dated tasks share one activity dot", () => {
    expect(
      dayHasDotActivity({
        iso: "2026-09-12",
        events: [
          event({
            id: "e1",
            title: "Team briefing",
            startDate: "2026-09-12T14:00:00",
          }),
        ],
        tasks: [task({ id: "t1", title: "Prep notes", dueDate: "2026-09-12T23:59:00" })],
      }),
    ).toBe(true);
    expect(
      dayHasDotActivity({
        iso: "2026-09-12",
        events: [],
        tasks: [task({ id: "t1", title: "Prep notes", dueDate: "2026-09-12T23:59:00" })],
      }),
    ).toBe(true);
  });

  test("multi-day events mark every applicable local date", () => {
    const trip = event({
      id: "trip",
      title: "Offsite",
      allDay: true,
      startDate: "2026-09-10",
      endDate: "2026-09-12",
    });
    expect(
      dayHasVisibleActivity({
        iso: "2026-09-11",
        events: [trip],
        tasks: [],
        holidays: [],
      }),
    ).toBe(true);
  });
});

describe("dedupeDatedTasksAgainstEvents", () => {
  test("drops a task that matches an event title on the same day", () => {
    const events = [
      event({
        id: "e1",
        title: "Operations review",
        startDate: "2026-09-12T18:00:00",
      }),
    ];
    const tasks = [
      task({ id: "t1", title: "Operations review", dueDate: "2026-09-12T00:00:00.000Z" }),
      task({ id: "t2", title: "Send recap", dueDate: "2026-09-12T00:00:00.000Z" }),
      task({ id: "t3", title: "No date" }),
    ];
    const result = dedupeDatedTasksAgainstEvents(tasks, events);
    expect(result.map((item) => item.id)).toEqual(["t2"]);
  });
});

describe("compareAgendaOrder", () => {
  test("orders all-day items, then timed events, then tasks", () => {
    const rows = [
      { kind: "task" as const, title: "Due task", startMs: 1 },
      { kind: "event" as const, title: "Briefing", startMs: 10, allDay: false },
      { kind: "holiday" as const, title: "Holiday", allDay: true },
      { kind: "event" as const, title: "All-hands", allDay: true },
      { kind: "event" as const, title: "Earlier call", startMs: 5, allDay: false },
    ];
    const sorted = rows.slice().sort(compareAgendaOrder);
    expect(sorted.map((row) => row.title)).toEqual([
      "Holiday",
      "All-hands",
      "Earlier call",
      "Briefing",
      "Due task",
    ]);
  });
});
