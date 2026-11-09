import { formatTimeZoneLabel, getBrowserTimeZone, resolveTimeZone } from "./timezone";
import { Temporal } from "@js-temporal/polyfill";

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallParts(date: Date): WallClockParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

/**
 * DateTimePicker always edits the device's wall clock. This carrier Date makes
 * an instant's workspace wall time visible in that picker without changing it.
 */
export function workspaceInstantToPickerDate(
  instant: string | Date,
  workspaceTimeZone?: string | null,
): Date {
  const source = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(source.getTime())) return new Date(Number.NaN);
  const zoned = Temporal.Instant.fromEpochMilliseconds(
    source.getTime(),
  ).toZonedDateTimeISO(resolveTimeZone(workspaceTimeZone));
  return new Date(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
    zoned.millisecond,
  );
}

export type WorkspaceTimeResolution = {
  instant: Date;
  adjustedForDaylightSaving: boolean;
  resolvedPickerDate: Date;
};

/**
 * Resolve workspace wall time with Temporal's compatible policy:
 * skipped spring-forward times move forward; repeated fall-back times use the
 * earlier occurrence.
 */
export function resolveWorkspacePickerDate(
  pickerDate: Date,
  workspaceTimeZone?: string | null,
): WorkspaceTimeResolution {
  if (Number.isNaN(pickerDate.getTime())) {
    const invalid = new Date(Number.NaN);
    return {
      instant: invalid,
      adjustedForDaylightSaving: false,
      resolvedPickerDate: invalid,
    };
  }
  const timeZone = resolveTimeZone(workspaceTimeZone);
  const desired = wallParts(pickerDate);
  const zoned = Temporal.PlainDateTime.from({
    year: desired.year,
    month: desired.month,
    day: desired.day,
    hour: desired.hour,
    minute: desired.minute,
    second: desired.second,
    millisecond: pickerDate.getMilliseconds(),
  }).toZonedDateTime(timeZone, { disambiguation: "compatible" });
  const resolvedPickerDate = new Date(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
    zoned.millisecond,
  );
  return {
    instant: new Date(zoned.epochMilliseconds),
    adjustedForDaylightSaving:
      zoned.year !== desired.year ||
      zoned.month !== desired.month ||
      zoned.day !== desired.day ||
      zoned.hour !== desired.hour ||
      zoned.minute !== desired.minute,
    resolvedPickerDate,
  };
}

/** Convert picker wall-clock fields in the workspace timezone to a UTC instant. */
export function workspacePickerDateToInstant(
  pickerDate: Date,
  workspaceTimeZone?: string | null,
): Date {
  return resolveWorkspacePickerDate(pickerDate, workspaceTimeZone).instant;
}

export function workspaceTimeZoneDiffersFromDevice(
  workspaceTimeZone?: string | null,
  deviceTimeZone = getBrowserTimeZone(),
): boolean {
  return resolveTimeZone(workspaceTimeZone) !== resolveTimeZone(deviceTimeZone);
}

export function formatWorkspaceTimeZoneContext(
  workspaceTimeZone?: string | null,
  now = new Date(),
): string {
  const fullLabel = formatTimeZoneLabel(resolveTimeZone(workspaceTimeZone), now);
  return `Workspace time: ${fullLabel.replace(/\s+\([^)]+\)$/, "")}`;
}
