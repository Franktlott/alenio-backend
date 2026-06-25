/** When a published check-in counts as completed (first publish, not draft save). */
export function oneOnOnePublishedAt(meeting: {
  status?: string;
  publishedAt?: Date | null;
  createdAt: Date;
}): Date | null {
  if (meeting.status === "draft") return null;
  return meeting.publishedAt ?? meeting.createdAt;
}
