type MeetingDateFields = {
  status?: "draft" | "published";
  publishedAt?: string | null;
  createdAt: string;
};

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
