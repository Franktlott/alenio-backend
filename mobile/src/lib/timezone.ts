export const DEFAULT_TIMEZONE = "UTC";

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

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
  return getBrowserTimeZone();
}

export function calendarDayFromInstant(instant: string | Date, timeZone?: string | null): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calendarDueIso(d: Date, timeZone?: string | null): string {
  return calendarDayFromInstant(d, timeZone);
}

/** Display a task due instant as its calendar date (due time is always end of day). */
export function formatTaskDueDateLabel(
  instant: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  if (!instant) return "—";
  const day = calendarDayFromInstant(instant, timeZone);
  if (!day) return "—";
  const [y, mo, d] = day.split("-").map(Number);
  const local = new Date(y!, mo! - 1, d);
  if (Number.isNaN(local.getTime())) return "—";
  return local.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
