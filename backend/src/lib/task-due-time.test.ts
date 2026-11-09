import { describe, expect, test } from "bun:test";
import { addCalendarDaysInTimeZone, calendarDayFromInstant } from "./timezone";
import { alignRecurringAnchorDueDate, parseTaskDueDate } from "./recurrence-series";

const TZ = "America/New_York";

function clock(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

describe("task due times", () => {
  test("a date alone is the end of that day", () => {
    const due = parseTaskDueDate("2026-10-28", TZ);
    expect(calendarDayFromInstant(due, TZ)).toBe("2026-10-28");
    expect(clock(due)).toBe("23:59:59");
  });

  test("a clock time is kept, including on the next occurrence", () => {
    const due = parseTaskDueDate("2026-10-28T16:40", TZ);
    expect(calendarDayFromInstant(due, TZ)).toBe("2026-10-28");
    expect(clock(due)).toBe("16:40:00");

    const next = addCalendarDaysInTimeZone(due, 1, TZ);
    expect(calendarDayFromInstant(next, TZ)).toBe("2026-10-29");
    expect(clock(next)).toBe("16:40:00");
  });

  test("a weekly series keeps the chosen time when it shifts weekday", () => {
    const due = parseTaskDueDate("2026-10-28T08:30", TZ);
    const friday = alignRecurringAnchorDueDate("weekly", due, "5", null, TZ);
    expect(calendarDayFromInstant(friday, TZ)).toBe("2026-10-30");
    expect(clock(friday)).toBe("08:30:00");
  });
});
