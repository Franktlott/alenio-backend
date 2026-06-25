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
