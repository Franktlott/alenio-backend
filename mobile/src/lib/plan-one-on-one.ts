import type { Href } from "expo-router";

export const ONE_ON_ONE_EVENT_COLOR = "#7C3AED";
export const ONE_ON_ONE_DURATION_OPTIONS = [30, 45, 60] as const;
export const ONE_ON_ONE_DEFAULT_DURATION_MINUTES = 45;
export const ONE_ON_ONE_REMINDER_MINUTES = [15];

export type OneOnOneCalendarEventFields = {
  isOneOnOne?: boolean;
  oneOnOneMemberUserId?: string | null;
  oneOnOneTemplateId?: string | null;
};

export type PlannedOneOnOneEvent = OneOnOneCalendarEventFields & {
  id: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  allDay?: boolean;
  isVideoMeeting?: boolean;
};

export function isUpcomingOneOnOneForMember(
  event: PlannedOneOnOneEvent,
  memberUserId: string,
  now = Date.now(),
): boolean {
  if (!event.isOneOnOne || event.oneOnOneMemberUserId !== memberUserId) return false;
  const endMs = new Date(event.endDate ?? event.startDate).getTime();
  return endMs >= now;
}

export function listUpcomingOneOnOnesForMember(
  events: PlannedOneOnOneEvent[],
  memberUserId: string,
): PlannedOneOnOneEvent[] {
  const now = Date.now();
  return events
    .filter((event) => isUpcomingOneOnOneForMember(event, memberUserId, now))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function oneOnOneEventTitle(memberName: string): string {
  const trimmed = memberName.trim();
  return trimmed ? `Check-in — ${trimmed}` : "Check-in";
}

export function oneOnOneEndFromDuration(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}

export function oneOnOneCheckInHref(
  teamId: string,
  memberUserId: string,
  templateId?: string | null,
): Href {
  return {
    pathname: "/member-profile",
    params: {
      teamId,
      memberUserId,
      tab: "check-in",
      startCheckIn: "1",
      ...(templateId ? { templateId } : {}),
    },
  };
}

export function planOneOnOneHref(
  teamId: string,
  options?: {
    memberUserId?: string;
    startDate?: string;
    templateId?: string;
    myRole?: string;
    eventId?: string;
  },
): Href {
  return {
    pathname: "/plan-one-on-one",
    params: {
      teamId,
      ...(options?.memberUserId ? { memberUserId: options.memberUserId } : {}),
      ...(options?.startDate ? { startDate: options.startDate } : {}),
      ...(options?.templateId ? { templateId: options.templateId } : {}),
      ...(options?.myRole ? { myRole: options.myRole } : {}),
      ...(options?.eventId ? { eventId: options.eventId } : {}),
    },
  };
}
