/** Mirrors `mobile/src/lib/calendar-grid.ts` for web parity. */

export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Column index when week starts Monday: 0=Mon … 6=Sun. `dayOfWeek` is JS `Date#getDay()` (0=Sun). */
export function calendarMondayColumnIndex(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

export type CalendarEventLike = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  allDay?: boolean | null;
  isExternal?: boolean;
  color?: string | null;
  isHidden?: boolean | null;
  isVideoMeeting?: boolean | null;
};

export type WeekBar = {
  id: string;
  title: string;
  color: string;
  startCol: number;
  endCol: number;
  isHidden?: boolean | null;
  isVideoMeeting?: boolean | null;
};

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse YYYY-MM-DD from an ISO timestamp without timezone drift. */
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
    // Legacy rows stored Outlook's exclusive end without subtracting a day.
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

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
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

export function isCurrentMonth(day: Date, month: Date): boolean {
  return day.getFullYear() === month.getFullYear() && day.getMonth() === month.getMonth();
}

export function computeWeekBars(week: Date[], events: CalendarEventLike[]): WeekBar[][] {
  const bars: WeekBar[] = [];

  for (const event of events) {
    const { start: evStart, end: evEnd } = eventCalendarDayRange(event);

    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < week.length; i++) {
      const day = week[i];
      if (!day) continue;
      const d = startOfDay(day);
      if (d >= evStart && d <= evEnd) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    if (startCol === -1) continue;

    bars.push({
      id: event.id,
      title: event.title,
      color: event.color?.trim() || "#4361EE",
      startCol,
      endCol,
      isHidden: event.isHidden ?? undefined,
      isVideoMeeting: event.isVideoMeeting ?? undefined,
    });
  }

  bars.sort((a, b) => b.endCol - b.startCol - (a.endCol - a.startCol) || a.startCol - b.startCol);

  const tracks: WeekBar[][] = [];
  for (const bar of bars) {
    let placed = false;
    for (const track of tracks) {
      const overlaps = track.some((b) => b.startCol <= bar.endCol && b.endCol >= b.startCol);
      if (!overlaps) {
        track.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) tracks.push([bar]);
  }

  return tracks;
}
