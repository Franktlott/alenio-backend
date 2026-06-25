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
