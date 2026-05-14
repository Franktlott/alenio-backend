export type USFederalHoliday = { name: string; date: Date };

/** Nth weekday in month: `weekday` 0=Sun…6=Sat; `nth` 1-based, or -1 for last. */
export function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const d = new Date(year, month, 1);
    let count = 0;
    while (true) {
      if (d.getDay() === weekday) {
        count++;
        if (count === nth) return new Date(d);
      }
      d.setDate(d.getDate() + 1);
    }
  }
  const d = new Date(year, month + 1, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return new Date(d);
}

export function getUSHolidays(year: number): USFederalHoliday[] {
  return [
    { name: "New Year's Day", date: new Date(year, 0, 1) },
    { name: "MLK Day", date: nthWeekday(year, 0, 1, 3) },
    { name: "Presidents' Day", date: nthWeekday(year, 1, 1, 3) },
    { name: "Memorial Day", date: nthWeekday(year, 4, 1, -1) },
    { name: "Juneteenth", date: new Date(year, 5, 19) },
    { name: "Independence Day", date: new Date(year, 6, 4) },
    { name: "Labor Day", date: nthWeekday(year, 8, 1, 1) },
    { name: "Columbus Day", date: nthWeekday(year, 9, 1, 2) },
    { name: "Veterans Day", date: new Date(year, 10, 11) },
    { name: "Thanksgiving", date: nthWeekday(year, 10, 4, 4) },
    { name: "Christmas Day", date: new Date(year, 11, 25) },
  ];
}
