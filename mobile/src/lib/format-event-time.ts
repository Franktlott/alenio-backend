/** Clock range for timed events and video meetings (meetings always show time even if allDay is set). */
export function formatEventTimeRange(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (!endDate) return fmt(start);
  return `${fmt(start)} – ${fmt(new Date(endDate))}`;
}

export function eventShowsScheduledTime(event: { allDay: boolean; isVideoMeeting?: boolean }): boolean {
  return event.isVideoMeeting === true || !event.allDay;
}
