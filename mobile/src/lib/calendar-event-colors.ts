/**
 * Fixed calendar colors by type — no user color picker.
 * Keep in sync with CalendarIconKey copy.
 */
export const CALENDAR_EVENT_COLORS = {
  public: "#4361EE",
  private: "#64748B",
  meeting: "#4F46E5",
  checkIn: "#059669",
  outlook: "#94A3B8",
  task: "#D97706",
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

/** Accent color for list rows, month bars, and API `color` field. */
export function resolveCalendarEventColor(input: CalendarEventColorInput): string {
  if (input.isExternal) return CALENDAR_EVENT_COLORS.outlook;
  if (input.isOneOnOne) return CALENDAR_EVENT_COLORS.checkIn;
  if (input.isVideoMeeting) return CALENDAR_EVENT_COLORS.meeting;
  if (input.isHidden) return CALENDAR_EVENT_COLORS.private;
  return CALENDAR_EVENT_COLORS.public;
}
