import type { SenecaWorkspaceContext } from "./seneca-workspace-context";
import {
  extractDateFromQuestion,
  extractMemberFromQuestion,
  extractTimeFromQuestion,
  conversationSourceText,
  resolveMemberByName,
} from "./seneca-plan-one-on-one";
import { calendarDayFromInstant, resolveTimeZone } from "./timezone";

export type SenecaCancelOneOnOneDraft = {
  memberName?: string | null;
  date?: string | null;
  time?: string | null;
};

export type SenecaCancelOneOnOneProposal = {
  eventId: string;
  memberUserId: string;
  memberName: string;
  startDate: string;
  dateLabel: string;
  timeLabel: string;
};

export type PlannedCheckInEventRow = {
  id: string;
  memberUserId: string;
  memberName: string;
  startDate: Date;
};

function formatLabels(start: Date, timeZone: string) {
  const tz = resolveTimeZone(timeZone);
  return {
    dateLabel: start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    }),
    timeLabel: start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }),
  };
}

function eventTimeKey(start: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(start);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function isCancelCheckInQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(delete|cancel|remove|clear|drop)\b/.test(q) &&
    /\b(check[- ]?in|1:1|one[- ]on[- ]one|scheduled|calendar|meeting)\b/.test(q)
  );
}

export function conversationHasCancelCheckInTopic(
  messages: Array<{ role: string; content: string }>,
  question: string,
): boolean {
  if (isCancelCheckInQuestion(question)) return true;
  const blob = [...messages.map((message) => message.content), question].join(" ").toLowerCase();
  if (
    !/\b(delete|cancel|remove|clear|drop|check[- ]?in|scheduled a check-in|cancelled a check-in)\b/.test(
      blob,
    )
  ) {
    return false;
  }
  const latest = question.toLowerCase();
  return /\b(confirm|yes|yep|yeah|go ahead|please do|delete it|cancel it|remove it|do it)\b/.test(
    latest,
  );
}

function matchPlannedCheckIn(
  events: PlannedCheckInEventRow[],
  memberUserId: string | null,
  dateOnly: string | null,
  time: string | null,
  timeZone: string,
): PlannedCheckInEventRow | null {
  let candidates = events;
  if (memberUserId) {
    candidates = candidates.filter((event) => event.memberUserId === memberUserId);
  }
  if (dateOnly) {
    candidates = candidates.filter(
      (event) => calendarDayFromInstant(event.startDate, timeZone) === dateOnly,
    );
  }
  if (time) {
    candidates = candidates.filter((event) => eventTimeKey(event.startDate, timeZone) === time);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && memberUserId && !dateOnly) {
    return candidates[0];
  }
  return null;
}

export function finalizeCancelOneOnOneProposal(
  draft: SenecaCancelOneOnOneDraft,
  question: string,
  messages: Array<{ role: string; content: string }>,
  upcoming: PlannedCheckInEventRow[],
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
): SenecaCancelOneOnOneProposal | null {
  if (upcoming.length === 0) return null;

  const source = conversationSourceText(messages, question);
  const memberQuery = draft.memberName?.trim() || extractMemberFromQuestion(source);
  const member = memberQuery ? resolveMemberByName(memberQuery, ctx.members) : null;
  const dateOnly = draft.date?.trim() || extractDateFromQuestion(source, new Date(), managerTimeZone);
  const time = draft.time?.trim() || extractTimeFromQuestion(source);

  const matched = matchPlannedCheckIn(
    upcoming,
    member?.userId ?? null,
    dateOnly,
    time,
    managerTimeZone,
  );
  if (!matched) return null;

  const labels = formatLabels(matched.startDate, managerTimeZone);
  return {
    eventId: matched.id,
    memberUserId: matched.memberUserId,
    memberName: matched.memberName,
    startDate: matched.startDate.toISOString(),
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
  };
}

export function buildCancelConfirmationMessage(proposal: SenecaCancelOneOnOneProposal): string {
  return `I can cancel your check-in with ${proposal.memberName} on ${proposal.dateLabel} at ${proposal.timeLabel}. Confirm below to remove it from both calendars.`;
}

export function buildCancelClarificationMessage(
  upcoming: PlannedCheckInEventRow[],
  timeZone: string,
): string {
  if (upcoming.length === 0) {
    return "You don't have any upcoming check-ins scheduled right now.";
  }
  const lines = upcoming.slice(0, 5).map((event) => {
    const labels = formatLabels(event.startDate, timeZone);
    return `${event.memberName} on ${labels.dateLabel} at ${labels.timeLabel}`;
  });
  return `I couldn't tell which check-in to cancel. Your upcoming check-ins are: ${lines.join("; ")}. Tell me who it's with or when it's scheduled.`;
}
