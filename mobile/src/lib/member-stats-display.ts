export type FollowUpTasksDisplay = {
  label: string;
  value: string;
  title: string;
  overdue: boolean;
};

/** Open follow-up count; shows overdue count when any follow-ups are overdue. */
export function formatFollowUpTasksDisplay(
  openFollowUpTasks: number,
  overdueFollowUpTasks: number,
): FollowUpTasksDisplay {
  if (overdueFollowUpTasks > 0) {
    return {
      label: "Overdue",
      value: String(overdueFollowUpTasks),
      title:
        overdueFollowUpTasks === 1
          ? "1 overdue follow-up task"
          : `${overdueFollowUpTasks} overdue follow-up tasks`,
      overdue: true,
    };
  }
  return {
    label: "Open follow-ups",
    value: String(Math.max(0, openFollowUpTasks)),
    title:
      openFollowUpTasks === 0
        ? "No open follow-up tasks"
        : openFollowUpTasks === 1
          ? "1 open follow-up task"
          : `${openFollowUpTasks} open follow-up tasks`,
    overdue: false,
  };
}
