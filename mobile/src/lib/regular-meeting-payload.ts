import { CALENDAR_EVENT_COLORS } from "./calendar-event-colors";

export type RegularMemberMeetingInput = {
  memberUserId: string;
  memberName: string;
  startDate: Date;
  durationMinutes: number;
};

export function buildRegularMemberMeetingPayload(
  input: RegularMemberMeetingInput,
) {
  const endDate = new Date(
    input.startDate.getTime() + input.durationMinutes * 60 * 1000,
  );
  return {
    title: input.memberName.trim()
      ? `Meeting with ${input.memberName.trim()}`
      : "Virtual meeting",
    startDate: input.startDate.toISOString(),
    endDate: endDate.toISOString(),
    allDay: false,
    color: CALENDAR_EVENT_COLORS.meeting,
    isHidden: true,
    isVideoMeeting: true,
    reminderMinutes: [15],
    assigneeIds: [input.memberUserId],
  };
}

export function buildScheduledCheckInPayload(
  input: RegularMemberMeetingInput & {
    templateId?: string | null;
    isVideoMeeting?: boolean;
  },
) {
  const endDate = new Date(
    input.startDate.getTime() + input.durationMinutes * 60 * 1000,
  );
  return {
    title: input.memberName.trim()
      ? `Check-in — ${input.memberName.trim()}`
      : "Check-in",
    startDate: input.startDate.toISOString(),
    endDate: endDate.toISOString(),
    allDay: false,
    color: CALENDAR_EVENT_COLORS.checkIn,
    isHidden: true,
    isOneOnOne: true,
    oneOnOneMemberUserId: input.memberUserId,
    oneOnOneTemplateId: input.templateId || undefined,
    isVideoMeeting: input.isVideoMeeting ?? true,
    reminderMinutes: [15],
    assigneeIds: [input.memberUserId],
  };
}
