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

function zonedClock(instant: string | Date, timeZone?: string | null) {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: string) => {
    const raw = parts.find((part) => part.type === type)?.value ?? "0";
    return Number(raw === "24" ? "0" : raw);
  };
  return { hour: num("hour"), minute: num("minute"), second: num("second") };
}

/** End-of-day storage means the task is due that day, not at a chosen clock time. */
export function taskDueHasClock(
  instant: string | Date | null | undefined,
  timeZone?: string | null,
): boolean {
  if (!instant) return false;
  const clock = zonedClock(instant, timeZone);
  if (!clock) return false;
  return !(clock.hour === 23 && clock.minute === 59 && clock.second >= 59);
}

export function formatTaskDueClock(
  instant: string | Date | null | undefined,
  timeZone?: string | null,
): string | null {
  if (!taskDueHasClock(instant, timeZone)) return null;
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when the task is due at a time. */
export function taskDuePayload(d: Date, timed: boolean, timeZone?: string | null): string {
  const day = calendarDayFromInstant(d, timeZone);
  if (!timed) return day;
  const clock = zonedClock(d, timeZone);
  const hour = String(clock?.hour ?? d.getHours()).padStart(2, "0");
  const minute = String(clock?.minute ?? d.getMinutes()).padStart(2, "0");
  return `${day}T${hour}:${minute}`;
}

export function withDueClock(day: Date, hours: number, minutes: number): Date {
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/** Next half hour on the chosen day, used when a task first gets a time. */
export function suggestedDueClock(day: Date, now = new Date()): Date {
  let hour = now.getHours();
  let minute = 0;
  if (now.getMinutes() < 30) minute = 30;
  else hour += 1;
  if (hour > 23) {
    hour = 23;
    minute = 30;
  }
  return withDueClock(day, hour, minute);
}

/** Display a task due instant as its calendar date. A chosen time is separate. */
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
