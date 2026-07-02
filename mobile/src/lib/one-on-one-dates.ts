type MeetingDateFields = {
  status?: "draft" | "published";
  publishedAt?: string | null;
  createdAt: string;
  templateId?: string | null;
};

type CheckInStandardsFilter = {
  requiredCheckInTemplateId?: string | null;
};

/** Published check-ins that count toward workplace standards (matches member-stats API). */
export function publishedCheckInsForStandards<T extends MeetingDateFields>(
  meetings: T[],
  standards: CheckInStandardsFilter,
): T[] {
  const published = meetings.filter((meeting) => meeting.status !== "draft");
  const requiredTemplateId = standards.requiredCheckInTemplateId;
  if (!requiredTemplateId) return published;
  return published.filter((meeting) => meeting.templateId === requiredTemplateId);
}

export function latestPublishedCheckInForStandards<T extends MeetingDateFields>(
  meetings: T[],
  standards: CheckInStandardsFilter,
): T | null {
  const eligible = publishedCheckInsForStandards(meetings, standards);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a))[0] ?? null;
}

/** ISO date when a check-in was completed (first publish). Null for drafts. */
export function oneOnOnePublishedAt(meeting: MeetingDateFields): string | null {
  if (meeting.status === "draft") return null;
  return meeting.publishedAt ?? meeting.createdAt;
}

/** For sorting and display: draft saved date vs published completion date. */
export function oneOnOneDisplayDate(meeting: MeetingDateFields): string {
  return oneOnOnePublishedAt(meeting) ?? meeting.createdAt;
}

export function oneOnOneDisplayDateMs(meeting: MeetingDateFields): number {
  return new Date(oneOnOneDisplayDate(meeting)).getTime();
}
