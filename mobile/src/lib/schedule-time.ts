/** True once a saved date and time are behind the clock. */
export function instantHasPassed(
  at: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!at) return false;
  const date = typeof at === "string" ? new Date(at) : at;
  return !Number.isNaN(date.getTime()) && date.getTime() < now.getTime();
}

/** A due instant saved as 11:59:59 PM means the day, not a chosen clock time. */
export function hasChosenClock(instant: Date): boolean {
  return !(
    instant.getHours() === 23 &&
    instant.getMinutes() === 59 &&
    instant.getSeconds() >= 59
  );
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayDelta(due: Date, now: Date): number {
  return Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
}

function lateParts(due: Date, now: Date): { main: string; sub: string } {
  const daysLate = Math.max(1, dayDelta(now, due));
  if (daysLate < 7) return { main: `${daysLate}d`, sub: "late" };
  const weeks = Math.max(1, Math.floor(daysLate / 7));
  return { main: `${weeks}w`, sub: "late" };
}

function clockParts(instant: Date): { main: string; sub: string } {
  let hour = instant.getHours();
  const minute = instant.getMinutes();
  const sub = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return { main: `${hour}:${String(minute).padStart(2, "0")}`, sub };
}

/**
 * The left column of a schedule row.
 * A clock when one was chosen. 11:59 PM for a task due today with no time.
 * All day for an all-day event. A short date when a dateless-time task is another day.
 * Late work leads with how late it is (skipped when done — the checkmark covers that).
 */
export function scheduleTimeParts(input: {
  at?: string | Date | null;
  allDay?: boolean;
  taskLike?: boolean;
  done?: boolean;
  now?: Date;
}): { main: string; sub: string } {
  if (!input.at) return { main: "—", sub: "" };
  const date = typeof input.at === "string" ? new Date(input.at) : input.at;
  if (Number.isNaN(date.getTime())) return { main: "—", sub: "" };
  const now = input.now ?? new Date();
  const delta = dayDelta(date, now);
  if (input.taskLike && !input.done && delta < 0) return lateParts(date, now);
  if (input.allDay) return { main: "All", sub: "day" };
  if (input.taskLike && !hasChosenClock(date)) {
    if (delta === 0) return { main: "11:59", sub: "PM" };
    return {
      main: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sub: "",
    };
  }
  return clockParts(date);
}
