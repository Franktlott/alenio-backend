import { describe, expect, it } from "vitest";
import {
  activityVisibleOnOverview,
  isOverviewRecentUpdateType,
  parseActivityTypesQuery,
} from "./workspace-recent-updates";

describe("workspace-recent-updates", () => {
  it("recognizes overview types", () => {
    expect(isOverviewRecentUpdateType("post")).toBe(true);
    expect(isOverviewRecentUpdateType("check_in_completed")).toBe(true);
    expect(isOverviewRecentUpdateType("task_completed")).toBe(false);
  });

  it("parses types query", () => {
    expect(parseActivityTypesQuery("post, celebration")).toEqual([
      "post",
      "celebration",
    ]);
    expect(parseActivityTypesQuery("")).toBeNull();
  });

  it("limits development goal visibility to managers and the member", () => {
    const activity = {
      type: "development_goal_completed",
      userId: "member-1",
      metadata: JSON.stringify({ targetUserId: "member-1", goalId: "g1" }),
    };
    expect(
      activityVisibleOnOverview(activity, {
        viewerUserId: "member-1",
        viewerRole: "member",
        eventsById: new Map(),
      }),
    ).toBe(true);
    expect(
      activityVisibleOnOverview(activity, {
        viewerUserId: "other",
        viewerRole: "member",
        eventsById: new Map(),
      }),
    ).toBe(false);
    expect(
      activityVisibleOnOverview(activity, {
        viewerUserId: "other",
        viewerRole: "owner",
        eventsById: new Map(),
      }),
    ).toBe(true);
  });

  it("limits check-in visibility to managers and participants", () => {
    const activity = {
      type: "check_in_completed",
      userId: "mgr",
      metadata: JSON.stringify({
        memberUserId: "member-1",
        managerUserId: "mgr",
        meetingId: "m1",
      }),
    };
    expect(
      activityVisibleOnOverview(activity, {
        viewerUserId: "member-1",
        viewerRole: "member",
        eventsById: new Map(),
      }),
    ).toBe(true);
    expect(
      activityVisibleOnOverview(activity, {
        viewerUserId: "stranger",
        viewerRole: "member",
        eventsById: new Map(),
      }),
    ).toBe(false);
  });
});
