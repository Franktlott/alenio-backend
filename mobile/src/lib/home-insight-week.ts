const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATION_EPOCH_UTC = Date.UTC(2026, 7, 24);

export function utcMondayStart(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(year, month, dayOfMonth - mondayOffset);
}

export function weeklyRotationIndex(date: Date, itemCount: number): number {
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new Error("Weekly rotation requires at least one item.");
  }
  const elapsedWeeks = Math.floor(
    (utcMondayStart(date) - ROTATION_EPOCH_UTC) / WEEK_MS,
  );
  return ((elapsedWeeks % itemCount) + itemCount) % itemCount;
}
