/** Calendar grids start on Monday (ISO-style week). */

export const CALENDAR_GRID_WEEKS = 6;
export const CALENDAR_GRID_DAYS = CALENDAR_GRID_WEEKS * 7;

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

  while (days.length < CALENDAR_GRID_DAYS) {
    const last = days[days.length - 1]!;
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
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
  if (/T12:00:00(\.0+)?Z$/.test(event.startDate)) return true;
  if (event.isExternal && event.endDate && isMidnightUtcIso(event.startDate) && isMidnightUtcIso(event.endDate)) {
    return true;
  }
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
      end = new Date(end.getTime() - 86_400_000);
      if (end < start) end = start;
    }
    return { start, end };
  }
  const start = startOfDay(new Date(event.startDate));
  const end = event.endDate ? startOfDay(new Date(event.endDate)) : start;
  return { start, end };
}

export type MonthWeekLaneItem = {
  id: string;
  startIso: string;
  endIso: string;
};

export type MonthWeekLaneCell = {
  id: string;
  showTitle: boolean;
  continuesLeft: boolean;
  continuesRight: boolean;
};

/** Pack multi-day events into a shared row so they stay aligned across the week. */
export function layoutMonthWeekLanes(input: {
  weekIsos: string[];
  spans: MonthWeekLaneItem[];
  singlesByDay: Record<string, string[]>;
  maxLanes: number;
}): {
  lanesByDay: Array<Array<MonthWeekLaneCell | null>>;
  overflowByDay: number[];
} {
  const weekIsos = input.weekIsos;
  const weekStart = weekIsos[0] ?? "";
  const weekEnd = weekIsos[weekIsos.length - 1] ?? "";
  const colOf = (iso: string) => weekIsos.indexOf(iso);

  const occupied = weekIsos.map(() => new Set<number>());
  const lanesByDay: Array<Array<MonthWeekLaneCell | null>> = weekIsos.map(() =>
    Array.from({ length: input.maxLanes }, () => null),
  );
  const overflowByDay = weekIsos.map(() => 0);

  const firstFreeLane = (colStart: number, colEnd: number): number | null => {
    for (let lane = 0; lane < input.maxLanes; lane++) {
      let free = true;
      for (let col = colStart; col <= colEnd; col++) {
        if (occupied[col]?.has(lane)) {
          free = false;
          break;
        }
      }
      if (free) return lane;
    }
    return null;
  };

  const clippedSpans = input.spans
    .filter((span) => span.endIso >= weekStart && span.startIso <= weekEnd)
    .map((span) => {
      const startIso = span.startIso < weekStart ? weekStart : span.startIso;
      const endIso = span.endIso > weekEnd ? weekEnd : span.endIso;
      return {
        ...span,
        colStart: colOf(startIso),
        colEnd: colOf(endIso),
      };
    })
    .filter((span) => span.colStart >= 0 && span.colEnd >= span.colStart)
    .sort((a, b) => {
      if (a.startIso !== b.startIso) return a.startIso < b.startIso ? -1 : 1;
      const aLen = a.colEnd - a.colStart;
      const bLen = b.colEnd - b.colStart;
      return bLen - aLen;
    });

  for (const span of clippedSpans) {
    const lane = firstFreeLane(span.colStart, span.colEnd);
    if (lane == null) {
      for (let col = span.colStart; col <= span.colEnd; col++) {
        overflowByDay[col] = (overflowByDay[col] ?? 0) + 1;
      }
      continue;
    }
    for (let col = span.colStart; col <= span.colEnd; col++) {
      const iso = weekIsos[col]!;
      occupied[col]!.add(lane);
      lanesByDay[col]![lane] = {
        id: span.id,
        showTitle: col === span.colStart,
        continuesLeft: span.startIso < iso,
        continuesRight: span.endIso > iso,
      };
    }
  }

  for (let col = 0; col < weekIsos.length; col++) {
    const ids = input.singlesByDay[weekIsos[col]!] ?? [];
    for (const id of ids) {
      const lane = firstFreeLane(col, col);
      if (lane == null) {
        overflowByDay[col] = (overflowByDay[col] ?? 0) + 1;
        continue;
      }
      occupied[col]!.add(lane);
      lanesByDay[col]![lane] = {
        id,
        showTitle: true,
        continuesLeft: false,
        continuesRight: false,
      };
    }
  }

  return { lanesByDay, overflowByDay };
}
