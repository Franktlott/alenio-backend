import type { OneOnOneFollowUpTask, OneOnOneMeeting } from "./api";

export type OneOnOneMeetingStatus = "open" | "completed" | "no_follow_up";

function isFollowUpTaskComplete(status: string): boolean {
  return status === "done";
}

export function getOneOnOneMeetingStatus(
  followUpTasks: OneOnOneFollowUpTask[] | undefined,
): OneOnOneMeetingStatus {
  const tasks = followUpTasks ?? [];
  if (tasks.length === 0) return "no_follow_up";
  const hasOpenTasks = tasks.some((task) => !isFollowUpTaskComplete(task.status));
  return hasOpenTasks ? "open" : "completed";
}

export function getOneOnOneMeetingStatusFromMeeting(
  meeting: Pick<OneOnOneMeeting, "followUpTasks">,
): OneOnOneMeetingStatus {
  return getOneOnOneMeetingStatus(meeting.followUpTasks);
}

export function oneOnOneMeetingStatusLabel(status: OneOnOneMeetingStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "completed":
      return "Completed";
    case "no_follow_up":
      return "No follow-up tasks";
  }
}

export function oneOnOneMeetingStatusClass(status: OneOnOneMeetingStatus): string {
  return `enterprise-oneone-status enterprise-oneone-status--${status.replace(/_/g, "-")}`;
}

/** Action label when reopening a check-in from the list or preview. */
export function checkInEditActionLabel(meeting: Pick<OneOnOneMeeting, "status">): string {
  return meeting.status === "draft" ? "Resume editing" : "Edit check-in";
}

/** Shorter label for row action menus. */
export function checkInEditMenuLabel(meeting: Pick<OneOnOneMeeting, "status">): string {
  return meeting.status === "draft" ? "Resume editing" : "Edit";
}

/** Only published check-ins may be printed. */
export function canPrintCheckIn(meeting: Pick<OneOnOneMeeting, "status">): boolean {
  return meeting.status !== "draft";
}

function isFollowUpTaskOverdue(task: OneOnOneFollowUpTask, todayStart: Date): boolean {
  if (task.status === "done") return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < todayStart;
}

export function countOverdueFollowUpTasks(
  followUpTasks: OneOnOneFollowUpTask[] | undefined,
  todayStart: Date,
): number {
  return (followUpTasks ?? []).filter((task) => isFollowUpTaskOverdue(task, todayStart)).length;
}
