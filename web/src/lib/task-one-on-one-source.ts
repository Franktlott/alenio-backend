import type { ApiTask } from "./api";
import { parseFeedbackTaskDescription } from "./one-on-one-feedback";
import { oneOnOnePublishedAt } from "./one-on-one-dates";

function formatSourceDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function memberLabel(userId: string, memberNameByUserId?: Record<string, string>): string {
  return memberNameByUserId?.[userId]?.trim() || "team member";
}

/** Subtitle for tasks created from a check-in (follow-up or associate feedback). */
export function formatTaskOneOnOneSource(
  task: ApiTask,
  memberNameByUserId?: Record<string, string>,
): string | null {
  const meeting = task.oneOnOneMeeting;
  if (meeting?.memberUserId) {
    const name = memberLabel(meeting.memberUserId, memberNameByUserId);
    const dateIso =
      oneOnOnePublishedAt({
        status: meeting.status === "draft" ? "draft" : "published",
        publishedAt: meeting.publishedAt ?? null,
        createdAt: meeting.createdAt,
      }) ?? meeting.createdAt;
    const datePart = dateIso ? formatSourceDate(dateIso) : "";
    return datePart
      ? `Generated from 1:1 with ${name} · ${datePart}`
      : `Generated from 1:1 with ${name}`;
  }

  const feedback = parseFeedbackTaskDescription(task.description);
  if (feedback) {
    const name = memberLabel(feedback.memberUserId, memberNameByUserId);
    return `Generated from 1:1 with ${name}`;
  }

  return null;
}
