/** Clock range for timed events and video meetings (meetings always show time even if allDay is set). */
export function formatEventTimeRange(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (!endDate) return fmt(start);
  return `${fmt(start)} – ${fmt(new Date(endDate))}`;
}

export function formatEventDateLabel(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function formatEventDateAndTime(startDate: string, endDate?: string | null): string {
  return `${formatEventDateLabel(startDate, endDate)} · ${formatEventTimeRange(startDate, endDate)}`;
}

export function eventShowsScheduledTime(event: { allDay: boolean; isVideoMeeting?: boolean }): boolean {
  return event.isVideoMeeting === true || !event.allDay;
}
