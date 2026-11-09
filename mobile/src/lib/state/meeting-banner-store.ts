import { create } from "zustand";

export type MeetingBannerSnapshot = {
  event: {
    id: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    teamId: string;
    isOneOnOne?: boolean;
    oneOnOneMemberUserId?: string | null;
    oneOnOneTemplateId?: string | null;
  };
  teamName: string;
  userRole: string;
};

type MeetingBannerState = {
  dismissedMeetingIds: string[];
  meetingSnapshots: Record<string, MeetingBannerSnapshot>;
  rememberMeeting: (meeting: MeetingBannerSnapshot) => void;
  forgetMeeting: (meetingId: string) => void;
  dismissMeeting: (meeting: MeetingBannerSnapshot) => void;
  restoreMeeting: (meetingId: string) => void;
  restoreAllDismissed: () => void;
};

export const useMeetingBannerStore = create<MeetingBannerState>((set) => ({
  dismissedMeetingIds: [],
  meetingSnapshots: {},
  rememberMeeting: (meeting) =>
    set((state) => ({
      meetingSnapshots: {
        ...state.meetingSnapshots,
        [meeting.event.id]: meeting,
      },
    })),
  forgetMeeting: (meetingId) =>
    set((state) => {
      const meetingSnapshots = { ...state.meetingSnapshots };
      delete meetingSnapshots[meetingId];
      return {
        meetingSnapshots,
        dismissedMeetingIds: state.dismissedMeetingIds.filter(
          (id) => id !== meetingId,
        ),
      };
    }),
  dismissMeeting: (meeting) =>
    set((state) => ({
      dismissedMeetingIds: state.dismissedMeetingIds.includes(meeting.event.id)
        ? state.dismissedMeetingIds
        : [...state.dismissedMeetingIds, meeting.event.id],
      meetingSnapshots: {
        ...state.meetingSnapshots,
        [meeting.event.id]: meeting,
      },
    })),
  restoreMeeting: (meetingId) =>
    set((state) => ({
      dismissedMeetingIds: state.dismissedMeetingIds.filter(
        (id) => id !== meetingId,
      ),
    })),
  restoreAllDismissed: () => set({ dismissedMeetingIds: [] }),
}));
