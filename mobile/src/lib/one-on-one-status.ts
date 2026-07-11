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
      return "No follow-ups";
  }
}

export function oneOnOneMeetingStatusColors(status: OneOnOneMeetingStatus): {
  bg: string;
  text: string;
  accent: string;
} {
  switch (status) {
    case "open":
      return { bg: "#FEF3C7", text: "#92400E", accent: "#F59E0B" };
    case "completed":
      return { bg: "#DCFCE7", text: "#166534", accent: "#16A34A" };
    case "no_follow_up":
      return { bg: "#F1F5F9", text: "#64748B", accent: "#94A3B8" };
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
