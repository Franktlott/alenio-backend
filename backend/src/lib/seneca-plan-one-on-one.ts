import type { SenecaWorkspaceContext } from "./seneca-workspace-context";
import {
  addCalendarDaysInTimeZone,
  calendarDayFromInstant,
  getZonedDayOfWeek,
  instantFromCalendarDateAndTime,
  resolveTimeZone,
} from "./timezone";

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

export function conversationHasScheduleTopic(
  messages: Array<{ role: string; content: string }>,
  question: string,
): boolean {
  if (isScheduleOneOnOneQuestion(question)) return true;
  const blob = [...messages.map((message) => message.content), question].join(" ").toLowerCase();
  if (!/\b(1:1|one[- ]on[- ]one|check[- ]?in|scheduled a check-in|plan a check-in|scheduled a 1:1|plan a 1:1)\b/.test(blob)) {
    return false;
  }
  const latest = question.toLowerCase();
  return (
    /\b(confirm|yes|yep|yeah|sounds good|that works|looks good|go ahead|please do|make it|change|move it|at \d|pm|am)\b/.test(
      latest,
    ) || isScheduleOneOnOneQuestion(latest)
  );
}

export function conversationSourceText(
  messages: Array<{ role: string; content: string }>,
  question: string,
): string {
  return [...messages.map((message) => message.content), question].join("\n");
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

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function addDaysInTimeZone(now: Date, days: number, timeZone: string): string {
  return calendarDayFromInstant(addCalendarDaysInTimeZone(now, days, timeZone), timeZone);
}

function nextWeekdayInTimeZone(weekday: number, now: Date, timeZone: string): string {
  const current = getZonedDayOfWeek(now, timeZone);
  let delta = weekday - current;
  if (delta <= 0) delta += 7;
  return addDaysInTimeZone(now, delta, timeZone);
}

export function extractDateFromQuestion(
  question: string,
  now = new Date(),
  timeZone = "UTC",
): string | null {
  const tz = resolveTimeZone(timeZone);
  const q = question.toLowerCase();

  if (/\b(today|tonight|this evening|this afternoon)\b/.test(q)) {
    return calendarDayFromInstant(now, tz);
  }

  if (/\btomorrow\b/.test(q)) {
    return addDaysInTimeZone(now, 1, tz);
  }

  const nextWeekday = q.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/,
  );
  if (nextWeekday?.[1]) {
    const weekday = WEEKDAYS[nextWeekday[1]];
    if (weekday !== undefined) {
      return nextWeekdayInTimeZone(weekday, now, tz);
    }
  }

  const iso = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];

  const slash = question.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${padDatePart(Number(slash[1]))}-${padDatePart(Number(slash[2]))}`;
  }

  const named = question.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i,
  );
  if (named?.[1] && named[2]) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : Number(calendarDayFromInstant(now, tz).slice(0, 4));
    if (month && day >= 1 && day <= 31) {
      return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
    }
  }

  return null;
}

function toTwentyFourHour(hour: number, meridiem: string): { hour: number; minute: number } | null {
  if (Number.isNaN(hour) || hour < 1 || hour > 12) return null;
  const lower = meridiem.toLowerCase().replace(/\./g, "");
  const isPm = lower.startsWith("p");
  const isAm = lower.startsWith("a");
  if (!isPm && !isAm) return null;
  let h = hour % 12;
  if (isPm) h += 12;
  return { hour: h, minute: 0 };
}

export function extractTimeFromQuestion(question: string): string | null {
  const q = question.toLowerCase();

  const withMinutes = q.match(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (withMinutes?.[1] && withMinutes[2] && withMinutes[3]) {
    const hour = Number(withMinutes[1]);
    const minute = Number(withMinutes[2]);
    const meridiem = withMinutes[3];
    if (!Number.isNaN(hour) && !Number.isNaN(minute) && minute >= 0 && minute <= 59) {
      const lower = meridiem.toLowerCase().replace(/\./g, "");
      let h = hour % 12;
      if (lower.startsWith("p") && hour < 12) h += 12;
      if (lower.startsWith("a") && hour === 12) h = 0;
      return `${padDatePart(h)}:${padDatePart(minute)}`;
    }
  }

  const simple = q.match(/\b(?:at\s+)?(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (simple?.[1] && simple[2]) {
    const parsed = toTwentyFourHour(Number(simple[1]), simple[2]);
    if (parsed) return `${padDatePart(parsed.hour)}:${padDatePart(parsed.minute)}`;
  }

  const twentyFour = q.match(/\bat\s+(\d{1,2}):(\d{2})\b/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (!Number.isNaN(hour) && !Number.isNaN(minute) && hour <= 23 && minute <= 59) {
      return `${padDatePart(hour)}:${padDatePart(minute)}`;
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
  sourceText?: string,
): SenecaPlanOneOnOneProposal | null {
  const source = sourceText ?? question;
  const memberQuery = draft.memberName?.trim() || extractMemberFromQuestion(source);
  const member = memberQuery ? resolveMemberByName(memberQuery, ctx.members) : null;
  if (!member) return null;

  const now = new Date();
  const dateOnly =
    extractDateFromQuestion(source, now, managerTimeZone) || draft.date?.trim() || null;
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const { hour, minute } = parseTimeParts(extractTimeFromQuestion(source) || draft.time);
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
  return `I'd like to schedule a virtual check-in with ${proposal.memberName} on ${proposal.dateLabel} at ${proposal.timeLabel} (${proposal.durationMinutes} min). Confirm below to add it to your calendar with a video join link, or edit the details first.`;
}
