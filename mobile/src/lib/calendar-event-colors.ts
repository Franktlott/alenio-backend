/**
 * Fixed calendar colors by type — no user color picker.
 * Keep in sync with CalendarIconKey copy.
 */
export const CALENDAR_EVENT_COLORS = {
  public: "#4361EE",
  private: "#64748B",
  meeting: "#7C3AED",
  checkIn: "#059669",
  outlook: "#94A3B8",
  task: "#128A52",
  holiday: "#EF4444",
} as const;

/** @deprecated Prefer CALENDAR_EVENT_COLORS.checkIn — kept for existing imports. */
export const ONE_ON_ONE_EVENT_COLOR = CALENDAR_EVENT_COLORS.checkIn;

export type CalendarEventColorInput = {
  isExternal?: boolean | null;
  isOneOnOne?: boolean | null;
  isVideoMeeting?: boolean | null;
  isHidden?: boolean | null;
};

/** Soft fill behind month chips and day-view blocks — titles render in black on top. */
export function calendarEventSoftBackground(input: CalendarEventColorInput): string {
  if (input.isVideoMeeting) return "#EDE9FE";
  if (input.isOneOnOne) return "#D1FAE5";
  if (input.isExternal) return "#F1F5F9";
  return "#E0E7FF";
}

/** Accent color for list rows, month bars, and API `color` field. */
export function resolveCalendarEventColor(input: CalendarEventColorInput): string {
  if (input.isExternal) return CALENDAR_EVENT_COLORS.outlook;
  if (input.isOneOnOne) return CALENDAR_EVENT_COLORS.checkIn;
  if (input.isVideoMeeting) return CALENDAR_EVENT_COLORS.meeting;
  if (input.isHidden) return CALENDAR_EVENT_COLORS.private;
  return CALENDAR_EVENT_COLORS.public;
}
