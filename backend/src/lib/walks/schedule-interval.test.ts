import { describe, expect, test } from "bun:test";
import { intervalStartMinutesForDay } from "./schedule-service";

describe("intervalStartMinutesForDay", () => {
  test("generates every 4 hours between 6am and 10pm", () => {
    expect(
      intervalStartMinutesForDay({
        intervalMinutes: 240,
        dayStartMinutes: 6 * 60,
        dayEndMinutes: 22 * 60,
      }),
    ).toEqual([360, 600, 840, 1080]);
  });

  test("generates every 2 hours", () => {
    expect(
      intervalStartMinutesForDay({
        intervalMinutes: 120,
        dayStartMinutes: 8 * 60,
        dayEndMinutes: 14 * 60,
      }),
    ).toEqual([480, 600, 720]);
  });

  test("defaults to 240 minutes when interval missing", () => {
    expect(
      intervalStartMinutesForDay({
        intervalMinutes: null,
        dayStartMinutes: 0,
        dayEndMinutes: 480,
      }),
    ).toEqual([0, 240]);
  });

  test("treats equal start/end as end of day", () => {
    const starts = intervalStartMinutesForDay({
      intervalMinutes: 720,
      dayStartMinutes: 0,
      dayEndMinutes: 0,
    });
    expect(starts[0]).toBe(0);
    expect(starts.length).toBeGreaterThan(1);
  });
});
