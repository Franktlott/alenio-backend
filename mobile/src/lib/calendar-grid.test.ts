import { describe, expect, test } from "bun:test";
import { layoutMonthWeekLanes } from "./calendar-grid";

const WEEK = [
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
];

describe("layoutMonthWeekLanes", () => {
  test("keeps a multi-day event on one row when a holiday lands mid-week", () => {
    const { lanesByDay } = layoutMonthWeekLanes({
      weekIsos: WEEK,
      spans: [{ id: "edc", startIso: "2026-09-01", endIso: "2026-09-15" }],
      singlesByDay: { "2026-09-07": ["labor-day"] },
      maxLanes: 3,
    });

    for (const day of lanesByDay) {
      expect(day[0]?.id).toBe("edc");
    }
    expect(lanesByDay[1]![1]).toEqual({
      id: "labor-day",
      showTitle: true,
      continuesLeft: false,
      continuesRight: false,
    });
    expect(lanesByDay[0]![0]).toMatchObject({
      showTitle: true,
      continuesLeft: true,
      continuesRight: true,
    });
    expect(lanesByDay[6]![0]).toMatchObject({
      showTitle: false,
      continuesLeft: true,
      continuesRight: true,
    });
  });

  test("rounds a span that starts and ends inside the week", () => {
    const { lanesByDay } = layoutMonthWeekLanes({
      weekIsos: WEEK,
      spans: [{ id: "trip", startIso: "2026-09-08", endIso: "2026-09-10" }],
      singlesByDay: {},
      maxLanes: 3,
    });

    expect(lanesByDay[2]![0]).toEqual({
      id: "trip",
      showTitle: true,
      continuesLeft: false,
      continuesRight: true,
    });
    expect(lanesByDay[3]![0]).toEqual({
      id: "trip",
      showTitle: false,
      continuesLeft: true,
      continuesRight: true,
    });
    expect(lanesByDay[4]![0]).toEqual({
      id: "trip",
      showTitle: false,
      continuesLeft: true,
      continuesRight: false,
    });
    expect(lanesByDay[1]![0]).toBeNull();
  });

  test("counts overflow when more than three rows are needed", () => {
    const { overflowByDay, lanesByDay } = layoutMonthWeekLanes({
      weekIsos: WEEK,
      spans: [],
      singlesByDay: {
        "2026-09-08": ["a", "b", "c", "d"],
      },
      maxLanes: 3,
    });

    expect(lanesByDay[2]!.map((cell) => cell?.id)).toEqual(["a", "b", "c"]);
    expect(overflowByDay[2]).toBe(1);
  });
});
