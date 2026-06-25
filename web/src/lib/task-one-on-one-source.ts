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
  return memberNameByUserId?.[userId]?.trim() || "your leader";
}

/** Who the viewer had the 1:1 with — associate sees manager; manager sees associate. */
function checkInCounterpartyId(
  associateUserId: string,
  managerUserId: string,
  viewerUserId?: string,
): string {
  if (viewerUserId && viewerUserId === associateUserId) return managerUserId;
  return associateUserId;
}

function counterpartyName(
  counterpartyId: string,
  managerUserId: string,
  managerName: string | null | undefined,
  memberNameByUserId?: Record<string, string>,
): string {
  if (counterpartyId === managerUserId) {
    const direct = managerName?.trim();
    if (direct) return direct;
  }
  const fromRoster = memberNameByUserId?.[counterpartyId]?.trim();
  if (fromRoster) return fromRoster;
  return counterpartyId === managerUserId ? "your leader" : "team member";
}

type SourceOptions = {
  memberNameByUserId?: Record<string, string>;
  viewerUserId?: string;
};

/** Subtitle for tasks created from a check-in (follow-up or associate feedback). */
export function formatTaskOneOnOneSource(task: ApiTask, options?: SourceOptions): string | null {
  const memberNameByUserId = options?.memberNameByUserId;
  const viewerUserId = options?.viewerUserId;

  const meeting = task.oneOnOneMeeting;
  if (meeting?.memberUserId && meeting.createdById) {
    const counterpartyId = checkInCounterpartyId(
      meeting.memberUserId,
      meeting.createdById,
      viewerUserId,
    );
    const name = counterpartyName(
      counterpartyId,
      meeting.createdById,
      meeting.createdBy?.name,
      memberNameByUserId,
    );
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
    const managerId = task.creatorId ?? task.creator?.id;
    if (!managerId) {
      const name = memberLabel(feedback.memberUserId, memberNameByUserId);
      return `Generated from 1:1 with ${name}`;
    }
    const counterpartyId = checkInCounterpartyId(feedback.memberUserId, managerId, viewerUserId);
    const name = counterpartyName(counterpartyId, managerId, task.creator?.name, memberNameByUserId);
    return `Generated from 1:1 with ${name}`;
  }

  return null;
}
