import { api } from "@/lib/api/api";
import {
  ONE_ON_ONE_EVENT_COLOR,
  ONE_ON_ONE_REMINDER_MINUTES,
  oneOnOneEndFromDuration,
  oneOnOneEventTitle,
} from "@/lib/plan-one-on-one";

export type CreatePlannedCheckInInput = {
  memberUserId: string;
  memberName: string;
  startDate: Date;
  durationMinutes: number;
  templateId?: string | null;
  isVideoMeeting?: boolean;
};

export function buildPlannedCheckInPayload(input: CreatePlannedCheckInInput) {
  const end = oneOnOneEndFromDuration(input.startDate, input.durationMinutes);
  return {
    title: oneOnOneEventTitle(input.memberName),
    startDate: input.startDate.toISOString(),
    endDate: end.toISOString(),
    allDay: false,
    color: ONE_ON_ONE_EVENT_COLOR,
    isHidden: true,
    isOneOnOne: true,
    oneOnOneMemberUserId: input.memberUserId,
    oneOnOneTemplateId: input.templateId || undefined,
    isVideoMeeting: input.isVideoMeeting ?? false,
    reminderMinutes: ONE_ON_ONE_REMINDER_MINUTES,
    assigneeIds: [input.memberUserId],
  };
}

export async function createPlannedCheckIn(teamId: string, input: CreatePlannedCheckInInput) {
  return api.post(`/api/teams/${teamId}/events`, buildPlannedCheckInPayload(input));
}
