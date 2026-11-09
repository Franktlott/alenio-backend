import { describe, expect, test } from "bun:test";
import {
  formatWorkspaceTimeZoneContext,
  resolveWorkspacePickerDate,
  workspaceInstantToPickerDate,
  workspacePickerDateToInstant,
  workspaceTimeZoneDiffersFromDevice,
} from "./workspace-event-time";

describe("workspace event time", () => {
  test("round trips a workspace wall time through UTC storage", () => {
    const pickerDate = new Date(2026, 6, 14, 9, 30, 0);
    const instant = workspacePickerDateToInstant(
      pickerDate,
      "America/Los_Angeles",
    );

    expect(instant.toISOString()).toBe("2026-07-14T16:30:00.000Z");
    const restored = workspaceInstantToPickerDate(
      instant,
      "America/Los_Angeles",
    );
    expect([
      restored.getFullYear(),
      restored.getMonth(),
      restored.getDate(),
      restored.getHours(),
      restored.getMinutes(),
    ]).toEqual([2026, 6, 14, 9, 30]);
  });

  test("uses the daylight-saving offset for the selected date", () => {
    const winter = workspacePickerDateToInstant(
      new Date(2026, 0, 15, 9, 0, 0),
      "America/New_York",
    );
    const summer = workspacePickerDateToInstant(
      new Date(2026, 6, 15, 9, 0, 0),
      "America/New_York",
    );

    expect(winter.toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  test("moves a skipped spring-forward time to the next valid time", () => {
    const resolution = resolveWorkspacePickerDate(
      new Date(2026, 2, 8, 2, 30, 0),
      "America/New_York",
    );

    expect(resolution.instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(resolution.adjustedForDaylightSaving).toBe(true);
    expect(resolution.resolvedPickerDate.getHours()).toBe(3);
    expect(resolution.resolvedPickerDate.getMinutes()).toBe(30);
  });

  test("uses the earlier occurrence of a repeated fall-back time", () => {
    const resolution = resolveWorkspacePickerDate(
      new Date(2026, 10, 1, 1, 30, 0),
      "America/New_York",
    );

    expect(resolution.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(resolution.adjustedForDaylightSaving).toBe(false);
  });

  test("only supplies workspace context when zones differ", () => {
    expect(
      workspaceTimeZoneDiffersFromDevice(
        "America/Chicago",
        "America/Chicago",
      ),
    ).toBe(false);
    expect(
      workspaceTimeZoneDiffersFromDevice(
        "America/Chicago",
        "America/New_York",
      ),
    ).toBe(true);
    expect(
      formatWorkspaceTimeZoneContext(
        "America/Chicago",
        new Date("2026-01-15T12:00:00.000Z"),
      ),
    ).toContain("Workspace time:");
  });
});
