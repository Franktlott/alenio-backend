export type FollowUpTasksDisplay = {
  label: string;
  value: string;
  title: string;
  overdue: true;
};

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
