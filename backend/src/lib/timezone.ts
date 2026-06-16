export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(raw?: string | null): string {
  if (raw && isValidTimeZone(raw)) return raw;
  return DEFAULT_TIMEZONE;
}

type WallTime = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function getZonedWallTime(date: Date, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")) % 24,
    mi: Number(get("minute")),
    s: Number(get("second")),
  };
}

function zonedWallTimeToDate(w: WallTime, timeZone: string, ms = 999): Date {
  let utc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s, ms);
  for (let i = 0; i < 4; i++) {
    const got = getZonedWallTime(new Date(utc), timeZone);
    const desired = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s, ms);
    const actual = Date.UTC(got.y, got.mo - 1, got.d, got.h, got.mi, got.s, ms);
    utc += desired - actual;
  }
  return new Date(utc);
}

/** UTC instant for end of a calendar day in the user's timezone. */
export function dueInstantFromCalendarDay(dateOnly: string, timeZone: string): Date {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(dateOnly);
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  return zonedWallTimeToDate({ y, mo, d, h: 23, mi: 59, s: 59 }, resolveTimeZone(timeZone));
}

export function calendarDayFromInstant(instant: string | Date, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getZonedDayOfWeek(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? date.getUTCDay();
}

export function addCalendarDaysInTimeZone(date: Date, days: number, timeZone: string): Date {
  const tz = resolveTimeZone(timeZone);
  const current = calendarDayFromInstant(date, tz);
  const match = current.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return date;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  // Pure calendar-day math on the wall date in tz — do not route through UTC midnight
  // or US timezones will drift backward one day per step (Mon → Sun → Sat).
  const next = new Date(Date.UTC(y, mo - 1, d));
  next.setUTCDate(next.getUTCDate() + days);
  const nextDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return dueInstantFromCalendarDay(nextDay, tz);
}

export function formatTimeZoneLabel(timeZone: string, now = new Date()): string {
  const tz = resolveTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longGeneric",
    }).formatToParts(now);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ? `${name} (${tz})` : tz;
  } catch {
    return tz;
  }
}

export const COMMON_TIMEZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
] as const;
