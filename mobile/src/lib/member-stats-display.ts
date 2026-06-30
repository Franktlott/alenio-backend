export type FollowUpTasksDisplay = {
  label: string;
  value: string;
  title: string;
  overdue: true;
};

export function formatDaysSinceCheckIn(days: number | null | undefined): string {
  if (days == null) return "None";
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
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
