import { describe, expect, test } from "bun:test";
import {
  scheduleCheckInHref,
  scheduleMeetingHref,
  videoCallHref,
} from "./meeting-navigation";
import {
  buildRegularMemberMeetingPayload,
  buildScheduledCheckInPayload,
} from "./regular-meeting-payload";

describe("simplified meeting scheduling", () => {
  test("routes new scheduling into the regular meeting form", () => {
    expect(scheduleMeetingHref("team-1")).toEqual({
      pathname: "/(app)/execute",
      params: { teamId: "team-1", openModal: "meeting" },
    });
  });

  test("routes check-in scheduling into the shared check-in form", () => {
    expect(scheduleCheckInHref("team-1")).toEqual({
      pathname: "/(app)/execute",
      params: { teamId: "team-1", openModal: "checkin" },
    });
  });

  test("regular meeting scheduling remains separate from check-ins", () => {
    const payload = buildRegularMemberMeetingPayload({
      memberUserId: "member-1",
      memberName: "Taylor",
      startDate: new Date("2026-09-02T15:00:00.000Z"),
      durationMinutes: 45,
    });
    expect(payload).toMatchObject({
      title: "Meeting with Taylor",
      isVideoMeeting: true,
      assigneeIds: ["member-1"],
    });
    expect("isOneOnOne" in payload).toBe(false);
    expect("oneOnOneTemplateId" in payload).toBe(false);
  });

  test("virtual and in-person check-ins differ only by video behavior", () => {
    const input = {
      memberUserId: "member-1",
      memberName: "Taylor",
      startDate: new Date("2026-09-02T15:00:00.000Z"),
      durationMinutes: 45,
    };
    const virtual = buildScheduledCheckInPayload({
      ...input,
      isVideoMeeting: true,
    });
    const inPerson = buildScheduledCheckInPayload({
      ...input,
      isVideoMeeting: false,
    });
    expect(virtual).toMatchObject({
      isOneOnOne: true,
      isVideoMeeting: true,
      oneOnOneMemberUserId: "member-1",
      assigneeIds: ["member-1"],
    });
    expect(inPerson).toMatchObject({
      isOneOnOne: true,
      isVideoMeeting: false,
      oneOnOneMemberUserId: "member-1",
      assigneeIds: ["member-1"],
    });
  });

  test("legacy check-in rooms join the standard video screen", () => {
    expect(videoCallHref("legacy-check-in-event", "Taylor check-in")).toEqual({
      pathname: "/video-call",
      params: {
        roomId: "legacy-check-in-event",
        roomName: "Taylor check-in",
      },
    });
  });
});
