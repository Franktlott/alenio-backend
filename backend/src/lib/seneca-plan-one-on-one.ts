import type { SenecaWorkspaceContext } from "./seneca-workspace-context";
import { instantFromCalendarDateAndTime, resolveTimeZone } from "./timezone";

export type SenecaPlanOneOnOneDraft = {
  memberName?: string | null;
  date?: string | null;
  time?: string | null;
  durationMinutes?: number | null;
};

export type SenecaPlanOneOnOneProposal = {
  memberUserId: string;
  memberName: string;
  startDate: string;
  durationMinutes: number;
  dateLabel: string;
  timeLabel: string;
};

const DEFAULT_DURATION_MINUTES = 45;
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function isScheduleOneOnOneQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    (/\b(schedule|plan|book|set up|setup|arrange)\b/.test(q) &&
      /\b(1:1|one[- ]on[- ]one|check[- ]?in)\b/.test(q)) ||
    /\b(1:1|one[- ]on[- ]one)\b.*\b(with|for)\b/.test(q)
  );
}

export function resolveMemberByName(
  query: string,
  members: SenecaWorkspaceContext["members"],
): SenecaWorkspaceContext["members"][number] | null {
  const normalized = query.toLowerCase().trim().replace(/[.,!?]+$/, "");
  if (!normalized) return null;

  const roster = members.filter((member) => member.role === "Member" || member.role === "Admin");
  const searchable = roster.length > 0 ? roster : members;

  for (const member of searchable) {
    if (member.name.toLowerCase() === normalized) return member;
  }

  const firstToken = normalized.split(/\s+/)[0] ?? "";
  if (firstToken) {
    const firstNameMatches = searchable.filter((member) =>
      member.name.toLowerCase().startsWith(firstToken),
    );
    if (firstNameMatches.length === 1) return firstNameMatches[0];
  }

  for (const member of searchable) {
    const name = member.name.toLowerCase();
    if (name.includes(normalized) || normalized.includes(name)) return member;
  }

  return null;
}

function parseTimeParts(time?: string | null): { hour: number; minute: number } {
  if (!time) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }
  return { hour, minute };
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function extractMemberFromQuestion(question: string): string | null {
  const match = question.match(/\b(?:with|for)\s+([a-z][a-z\s'.-]{1,40})/i);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/\bon\s+.+$/i, "")
    .replace(/\bat\s+.+$/i, "")
    .trim();
}

export function extractDateFromQuestion(question: string, now = new Date()): string | null {
  const iso = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const slash = question.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${padDatePart(Number(slash[1]))}-${padDatePart(Number(slash[2]))}`;
  }

  const named = question.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i,
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : now.getFullYear();
    if (month && day >= 1 && day <= 31) {
      return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
    }
  }

  return null;
}

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

export function finalizePlanOneOnOneProposal(
  draft: SenecaPlanOneOnOneDraft,
  question: string,
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
): SenecaPlanOneOnOneProposal | null {
  const memberQuery = draft.memberName?.trim() || extractMemberFromQuestion(question);
  const member = memberQuery ? resolveMemberByName(memberQuery, ctx.members) : null;
  if (!member) return null;

  const dateOnly = draft.date?.trim() || extractDateFromQuestion(question);
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const { hour, minute } = parseTimeParts(draft.time);
  const start = instantFromCalendarDateAndTime(dateOnly, hour, minute, managerTimeZone);
  if (Number.isNaN(start.getTime())) return null;

  const durationMinutes =
    draft.durationMinutes && draft.durationMinutes > 0
      ? Math.round(draft.durationMinutes)
      : DEFAULT_DURATION_MINUTES;
  const labels = formatLabels(start, managerTimeZone);

  return {
    memberUserId: member.userId,
    memberName: member.name,
    startDate: start.toISOString(),
    durationMinutes,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
  };
}

export function buildPlanConfirmationMessage(proposal: SenecaPlanOneOnOneProposal): string {
  return `I'd like to schedule a 1:1 with ${proposal.memberName} on ${proposal.dateLabel} at ${proposal.timeLabel} (${proposal.durationMinutes} min). Please confirm before I add it to your calendar.`;
}
