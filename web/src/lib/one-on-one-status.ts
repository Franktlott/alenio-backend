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
