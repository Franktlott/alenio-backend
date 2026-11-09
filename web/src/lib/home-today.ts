import { apiGetJson } from "./api";
import { getUSHolidays } from "./us-federal-holidays";

/* Today card data and the same timing rules the phone uses. */

export type HomeTodayItemType = "task" | "reminder" | "event" | "meeting" | "check_in" | "holiday" | "external";

export type HomeTodayItem = {
  id: string;
  type: HomeTodayItemType;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  workspace: { id: string; name: string } | null;
  priority?: string;
  /** Finished today. Stays on Today, shown as already done. */
  done?: boolean;
  /** A task carried in from an earlier day, still unfinished. */
  overdue?: boolean;
};

export type HomeTodayResponse = {
  date: string;
  timeZone: string;
  dateStart: string;
  dateEnd: string;
  items: HomeTodayItem[];
};

export type TodayLane = "past" | "late" | "open";
export type TodayRowState = "past" | "late" | "next" | "later";

export const TODAY_ITEM_LABEL: Record<HomeTodayItemType, string> = {
  task: "Task",
  reminder: "Reminder",
  event: "Event",
  meeting: "Meeting",
  check_in: "Check-in",
  holiday: "Holiday",
  external: "Outlook",
};

export const TODAY_ITEM_TONE: Record<HomeTodayItemType, { color: string; surface: string }> = {
  task: { color: "#4361ee", surface: "#eef2ff" },
  reminder: { color: "#a65b13", surface: "#fff5e8" },
  event: { color: "#167c63", surface: "#eaf8f3" },
  meeting: { color: "#7550d9", surface: "#f1edff" },
  check_in: { color: "#23789b", surface: "#eaf7fb" },
  holiday: { color: "#a87312", surface: "#fff7e5" },
  external: { color: "#2563a9", surface: "#eaf2fc" },
};

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function fetchHomeToday(timeZone: string) {
  return apiGetJson<{ data: HomeTodayResponse }>(
    `/api/activity/today?timeZone=${encodeURIComponent(timeZone)}`,
  ).then((r) => r.data);
}

/** Adds the US federal holiday for the day, same as the phone's Home. */
export function withHoliday(data: HomeTodayResponse | undefined): HomeTodayItem[] {
  const items = data?.items ?? [];
  if (!data?.date) return items;
  const [year, month, day] = data.date.split("-").map(Number);
  if (!year || !month || !day) return items;
  const holiday = getUSHolidays(year).find(
    ({ date }) => date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day,
  );
  if (!holiday) return items;
  return [
    {
      id: `holiday-${data.date}`,
      type: "holiday",
      title: holiday.name,
      startAt: data.dateStart,
      endAt: data.dateEnd,
      allDay: true,
      workspace: null,
    },
    ...items,
  ];
}

export function isTaskLike(item: HomeTodayItem): boolean {
  return item.type === "task" || item.type === "reminder";
}

function instantHasPassed(at: string, now: number): boolean {
  const time = new Date(at).getTime();
  return Number.isFinite(time) && time < now;
}

/** A due instant saved as 11:59:59 PM means the day, not a chosen clock time. */
function hasChosenClock(instant: Date): boolean {
  return !(instant.getHours() === 23 && instant.getMinutes() === 59 && instant.getSeconds() >= 59);
}

/** A task due at 11:59:59 PM was given a day. Any other clock time was chosen. */
export function todayItemHasClock(item: HomeTodayItem): boolean {
  if (item.allDay) return false;
  if (!isTaskLike(item)) return true;
  const date = new Date(item.startAt);
  if (Number.isNaN(date.getTime())) return false;
  return hasChosenClock(date);
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayDelta(due: Date, now: Date): number {
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** An open task whose due date and time have both passed. */
export function taskPastDue(item: HomeTodayItem, now: number): boolean {
  return isTaskLike(item) && !item.done && !item.allDay && instantHasPassed(item.startAt, now);
}

function isItemOver(item: HomeTodayItem, now: number): boolean {
  if (item.overdue || isTaskLike(item)) return false;
  const end = new Date(item.endAt ?? item.startAt).getTime();
  return Number.isFinite(end) && end < now;
}

export function laneFor(item: HomeTodayItem, now: number): TodayLane {
  if (item.done) return "past";
  if (item.overdue || taskPastDue(item, now)) return "late";
  if (isItemOver(item, now)) return "past";
  return "open";
}

/** The next item that still has a clock time ahead. A day-only task waits behind those. */
export function nextUpIndex(items: HomeTodayItem[], lanes: TodayLane[], now: number): number {
  const hasClock = (index: number) => {
    const item = items[index];
    return !!item && todayItemHasClock(item);
  };
  const upcoming = lanes.findIndex(
    (lane, index) => lane === "open" && hasClock(index) && new Date(items[index]!.startAt).getTime() >= now,
  );
  if (upcoming >= 0) return upcoming;
  const timed = lanes.findIndex((lane, index) => lane === "open" && hasClock(index));
  if (timed >= 0) return timed;
  return lanes.findIndex((lane) => lane === "open");
}

/**
 * The left column of a schedule row.
 * A clock when one was chosen. 11:59 PM for a task due today with no time.
 * All day for an all-day event. Late work leads with how late it is.
 */
export function scheduleTimeParts(item: HomeTodayItem, now: Date = new Date()): { main: string; sub: string } {
  const date = new Date(item.startAt);
  if (Number.isNaN(date.getTime())) return { main: "—", sub: "" };
  const delta = dayDelta(date, now);
  const taskLike = isTaskLike(item);
  if (taskLike && delta < 0) {
    const daysLate = Math.max(1, dayDelta(now, date));
    if (daysLate < 7) return { main: `${daysLate}d`, sub: "late" };
    return { main: `${Math.max(1, Math.floor(daysLate / 7))}w`, sub: "late" };
  }
  if (item.allDay) return { main: "All", sub: "day" };
  if (taskLike && !hasChosenClock(date)) {
    if (delta === 0) return { main: "11:59", sub: "PM" };
    return { main: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), sub: "" };
  }
  let hour = date.getHours();
  const minute = date.getMinutes();
  const sub = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return { main: `${hour}:${String(minute).padStart(2, "0")}`, sub };
}

/** "3 days late" is the fact a reader acts on; the old date is not. */
export function overdueLabel(item: HomeTodayItem): string {
  const due = new Date(item.startAt);
  const today = new Date();
  const daysLate = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) /
      86_400_000,
  );
  if (daysLate <= 1) return "Due yesterday";
  if (daysLate < 7) return `${daysLate} days late`;
  const weeks = Math.floor(daysLate / 7);
  return weeks === 1 ? "A week late" : `${weeks} weeks late`;
}

function durationLabel(item: HomeTodayItem): string | null {
  if (!item.endAt) return null;
  const minutes = Math.round((new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hr" : `${hours} hr`;
  }
  return `${minutes} min`;
}

export function metaLine(item: HomeTodayItem, now = Date.now()): { line: string; late: string | null } {
  const parts = [...(item.workspace?.name ? [item.workspace.name] : []), TODAY_ITEM_LABEL[item.type]];
  if (item.overdue || (isTaskLike(item) && taskPastDue(item, now))) {
    return { line: item.workspace?.name ?? "", late: item.overdue ? overdueLabel(item) : "Overdue" };
  }
  const duration = durationLabel(item);
  if (duration) parts.push(duration);
  return { line: parts.join(" · "), late: null };
}

export function todayDateLabel(date = new Date()): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
