/** Calendar grids start on Monday (ISO-style week). */

export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Column index when week starts Monday: 0=Mon … 6=Sun. `dayOfWeek` is JS `Date#getDay()` (0=Sun). */
export function calendarMondayColumnIndex(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

export function getDaysInMonth(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = calendarMondayColumnIndex(new Date(year, month, 1).getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthDays - i));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const remaining = days.length % 7;
  if (remaining !== 0) {
    for (let d = 1; d <= 7 - remaining; d++) {
      days.push(new Date(year, month + 1, d));
    }
  }

  return days;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function calendarDateFromIsoDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function isMidnightUtcIso(iso: string): boolean {
  return /T00:00:00(\.0+)?Z?$/.test(iso);
}

function shouldUseCalendarDays(event: {
  startDate: string;
  endDate?: string | null;
  allDay?: boolean | null;
  isExternal?: boolean;
}): boolean {
  if (event.allDay) return true;
  if (!event.isExternal) return false;
  if (/T12:00:00(\.0+)?Z$/.test(event.startDate)) return true;
  if (event.endDate && isMidnightUtcIso(event.startDate) && isMidnightUtcIso(event.endDate)) return true;
  return false;
}

export function eventCalendarDayRange(event: {
  startDate: string;
  endDate?: string | null;
  allDay?: boolean | null;
  isExternal?: boolean;
}): { start: Date; end: Date } {
  if (shouldUseCalendarDays(event)) {
    const start = calendarDateFromIsoDay(event.startDate);
    let end = event.endDate ? calendarDateFromIsoDay(event.endDate) : start;
    if (
      event.isExternal &&
      !event.allDay &&
      event.endDate &&
      isMidnightUtcIso(event.startDate) &&
      isMidnightUtcIso(event.endDate)
    ) {
      const daySpan = Math.round((end.getTime() - start.getTime()) / 86_400_000);
      if (daySpan === 1) end = start;
    }
    return { start, end };
  }
  const start = startOfDay(new Date(event.startDate));
  const end = event.endDate ? startOfDay(new Date(event.endDate)) : start;
  return { start, end };
}
