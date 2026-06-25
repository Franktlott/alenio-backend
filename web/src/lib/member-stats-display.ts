/** Task completion streak — consecutive on-time task completions, not calendar days. */
export function formatTaskStreakValue(streak: number, paid: boolean): string {
  if (!paid) return "—";
  return String(Math.max(0, streak));
}

export function formatTaskStreakTitle(streak: number): string {
  if (streak <= 0) return "No active on-time task streak";
  if (streak === 1) return "1 on-time task completed in a row";
  return `${streak} on-time tasks completed in a row`;
}

export function formatDaysSinceCheckIn(days: number | null | undefined): string {
  if (days == null) return "None";
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export function formatDaysSinceCheckInTitle(days: number | null | undefined): string {
  if (days == null) return "No published check-in yet";
  if (days === 0) return "Last check-in was today";
  if (days === 1) return "Last check-in was 1 day ago";
  return `Last check-in was ${days} days ago`;
}

export function formatActiveGoalsCount(count: number): string {
  return String(Math.max(0, count));
}

export function formatActiveGoalsTitle(count: number): string {
  if (count === 0) return "No active development goals";
  if (count === 1) return "1 active development goal";
  return `${count} active development goals`;
}
