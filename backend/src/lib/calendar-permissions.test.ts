import { describe, expect, test } from "bun:test";
import {
  canManageCalendarEvent,
  canViewCalendarEvent,
  isCalendarManagerRole,
  resolveCalendarCreate,
  resolveCalendarUpdate,
} from "./calendar-permissions";

describe("legacy workspace admin calendar permissions", () => {
  test("is read-only for other members' calendar entries", () => {
    const event = {
      createdById: "member-1",
      isHidden: false,
      approvalStatus: "approved",
      isVideoMeeting: false,
      isOneOnOne: false,
    };

    expect(isCalendarManagerRole("admin")).toBe(false);
    expect(canViewCalendarEvent(event, "legacy-admin", "admin")).toBe(true);
    expect(
      canManageCalendarEvent("admin", "legacy-admin", event),
    ).toBe(false);
    expect(
      resolveCalendarUpdate("admin", "legacy-admin", event, {}),
    ).toEqual({
      ok: false,
      message: "You can only edit your own calendar entries.",
    });
  });

  test("owner and team leader retain calendar management", () => {
    for (const role of ["owner", "team_leader"]) {
      expect(
        canManageCalendarEvent(role, "manager", {
          createdById: "member-1",
        }),
      ).toBe(true);
    }
  });
});

describe("workspace calendar approval policy", () => {
  test("members publish privately or submit public events for approval", () => {
    expect(resolveCalendarCreate("member", { isHidden: true })).toEqual({
      ok: true,
      isHidden: true,
      isVideoMeeting: false,
      approvalStatus: "approved",
    });
    expect(resolveCalendarCreate("member", { isHidden: false })).toEqual({
      ok: true,
      isHidden: false,
      isVideoMeeting: false,
      approvalStatus: "pending",
    });
  });

  test("owners and team leaders publish public events immediately", () => {
    for (const role of ["owner", "team_leader"]) {
      expect(resolveCalendarCreate(role, { isHidden: false })).toEqual({
        ok: true,
        isHidden: false,
        isVideoMeeting: false,
        approvalStatus: "approved",
      });
    }
  });

  test("pending public events stay out of every calendar until approved", () => {
    const pendingEvent = {
      createdById: "member-1",
      isHidden: false,
      approvalStatus: "pending",
      isVideoMeeting: false,
      isOneOnOne: false,
    };
    expect(canViewCalendarEvent(pendingEvent, "member-1", "member")).toBe(false);
    expect(canViewCalendarEvent(pendingEvent, "member-2", "member")).toBe(false);
    expect(canViewCalendarEvent(pendingEvent, "leader-1", "team_leader")).toBe(false);
  });

  test("member edits to a public event always return it to approval", () => {
    const approvedPublicEvent = {
      createdById: "member-1",
      isHidden: false,
      approvalStatus: "approved",
      isVideoMeeting: false,
    };
    expect(
      resolveCalendarUpdate("member", "member-1", approvedPublicEvent, {}),
    ).toEqual({
      ok: true,
      forbidVideo: true,
      resetApproval: "pending",
    });
  });

  test("member private event edits remain approved", () => {
    const privateEvent = {
      createdById: "member-1",
      isHidden: true,
      approvalStatus: "approved",
      isVideoMeeting: false,
    };
    expect(
      resolveCalendarUpdate("member", "member-1", privateEvent, {}),
    ).toEqual({
      ok: true,
      forbidVideo: true,
      resetApproval: "approved",
    });
  });

  test("leader edits do not implicitly approve a pending event", () => {
    const pendingEvent = {
      createdById: "member-1",
      isHidden: false,
      approvalStatus: "pending",
      isVideoMeeting: false,
    };
    expect(
      resolveCalendarUpdate(
        "team_leader",
        "leader-1",
        pendingEvent,
        { isHidden: false },
      ),
    ).toEqual({ ok: true });
  });
});
