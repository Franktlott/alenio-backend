import type { OneOnOneFollowUpTask, OneOnOneMeeting } from "@/lib/member-profile-api";

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

export function oneOnOneMeetingStatusColors(status: OneOnOneMeetingStatus): {
  bg: string;
  text: string;
} {
  switch (status) {
    case "open":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "completed":
      return { bg: "#DCFCE7", text: "#166534" };
    case "no_follow_up":
      return { bg: "#F1F5F9", text: "#64748B" };
  }
}

/** Action label when reopening a check-in from the list or preview. */
export function checkInEditActionLabel(meeting: Pick<OneOnOneMeeting, "status">): string {
  return meeting.status === "draft" ? "Resume editing" : "Edit check-in";
}

/** Shorter label for row action menus. */
export function checkInEditMenuLabel(meeting: Pick<OneOnOneMeeting, "status">): string {
  return meeting.status === "draft" ? "Resume editing" : "Edit";
}
