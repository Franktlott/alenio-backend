import { eventCalendarDayRange, calendarDateFromIsoDay } from "@/lib/calendar-grid";
import type { CalendarEvent, Task } from "@/lib/types";
import type { USFederalHoliday } from "@/lib/us-federal-holidays";

const SUNDAY_MONTH_WEEK_COUNT = 5;

/** Sunday-start month grid with five week rows. Six-week months keep a sixth row so dates are not dropped. */
export function sundayMonthWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: Date[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push(new Date(year, month - 1, prevMonthDays - i));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length < SUNDAY_MONTH_WEEK_COUNT * 7) {
    const last = cells[cells.length - 1]!;
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function isDateOnlyOrUtcMidnight(iso: string): boolean {
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return true;
  return (
    iso.startsWith(day) &&
    /T00:00:00(\.\d+)?(Z|[+-]00:00)?$/.test(iso.slice(10))
  );
}

/** Local calendar day for date-only deadlines without UTC day-shift. */
export function datedItemLocalIso(iso: string): string {
  if (isDateOnlyOrUtcMidnight(iso)) {
    return iso.slice(0, 10);
  }
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function holidayLocalIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function datedTasksOnly(tasks: Task[]): Task[] {
  return tasks.filter((task) => Boolean(task.dueDate));
}

/** Drop dated tasks that already appear as a calendar event on the same local day. */
export function dedupeDatedTasksAgainstEvents(
  tasks: Task[],
  events: CalendarEvent[],
): Task[] {
  const eventTitlesByDay = new Map<string, Set<string>>();
  for (const event of events) {
    const title = normalizeTitle(event.title);
    if (!title) continue;
    const { start, end } = eventCalendarDayRange(event);
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= last) {
      const iso = holidayLocalIso(cursor);
      const titles = eventTitlesByDay.get(iso) ?? new Set<string>();
      titles.add(title);
      eventTitlesByDay.set(iso, titles);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return datedTasksOnly(tasks).filter((task) => {
    if (!task.dueDate) return false;
    const iso = datedItemLocalIso(task.dueDate);
    const titles = eventTitlesByDay.get(iso);
    if (!titles) return true;
    return !titles.has(normalizeTitle(task.title));
  });
}

export function localIsoFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function eventsOnLocalIso(events: CalendarEvent[], iso: string): CalendarEvent[] {
  const target = calendarDateFromIsoDay(iso);
  return events.filter((event) => {
    const { start, end } = eventCalendarDayRange(event);
    return start <= target && target <= end;
  });
}

export function holidaysOnLocalIso(
  holidays: USFederalHoliday[],
  iso: string,
): USFederalHoliday[] {
  return holidays.filter((holiday) => holidayLocalIso(holiday.date) === iso);
}

export function tasksOnLocalIso(tasks: Task[], iso: string): Task[] {
  return datedTasksOnly(tasks).filter(
    (task) => task.dueDate && datedItemLocalIso(task.dueDate) === iso,
  );
}

export function dayHasDotActivity(args: {
  iso: string;
  events: CalendarEvent[];
  tasks: Task[];
}): boolean {
  const { iso } = args;
  return eventsOnLocalIso(args.events, iso).length > 0 || tasksOnLocalIso(args.tasks, iso).length > 0;
}

export function dayHasVisibleActivity(args: {
  iso: string;
  events: CalendarEvent[];
  tasks: Task[];
  holidays: USFederalHoliday[];
}): boolean {
  return (
    dayHasDotActivity(args) || holidaysOnLocalIso(args.holidays, args.iso).length > 0
  );
}

export type AgendaKind = "holiday" | "event" | "task";

export function compareAgendaOrder(
  a: { kind: AgendaKind; allDay?: boolean; startMs?: number; title: string },
  b: { kind: AgendaKind; allDay?: boolean; startMs?: number; title: string },
): number {
  const group = (item: typeof a) => {
    if (item.kind === "task") return 2;
    if (item.allDay || item.kind === "holiday") return 0;
    return 1;
  };
  const groupDelta = group(a) - group(b);
  if (groupDelta !== 0) return groupDelta;
  if (a.kind === "holiday" && b.kind !== "holiday") return -1;
  if (a.kind !== "holiday" && b.kind === "holiday") return 1;
  if ((a.startMs ?? 0) !== (b.startMs ?? 0)) return (a.startMs ?? 0) - (b.startMs ?? 0);
  return a.title.localeCompare(b.title);
}
