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

export function calendarDaysSinceDate(iso: string): number {
  const then = new Date(iso);
  const now = new Date();
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfThenUtc = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  return Math.max(0, Math.floor((startOfTodayUtc - startOfThenUtc) / 86_400_000));
}

export function formatDaysSinceCheckIn(days: number | null | undefined): string {
  if (days == null) return "No check-in yet";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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

export type FollowUpTasksDisplay = {
  label: string;
  value: string;
  title: string;
  overdue: true;
};

/** Roster KPI for overdue check-in follow-ups only; hidden when none are overdue. */
export function formatOverdueFollowUpTasksDisplay(
  overdueFollowUpTasks: number,
): FollowUpTasksDisplay | null {
  if (overdueFollowUpTasks <= 0) return null;
  return {
    label: "Overdue",
    value: String(overdueFollowUpTasks),
    title:
      overdueFollowUpTasks === 1
        ? "1 overdue follow-up from a check-in"
        : `${overdueFollowUpTasks} overdue follow-ups from check-ins`,
    overdue: true,
  };
}
