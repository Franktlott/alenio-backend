import { describe, expect, test } from "bun:test";
import { workspaceDevelopmentHref } from "./workspace-development-navigation";

describe("workspaceDevelopmentHref", () => {
  test("opens a member's goals in the workspace they belong to", () => {
    expect(
      workspaceDevelopmentHref("team-1", {
        memberUserId: "member-1",
        section: "goals",
        createGoal: true,
      }),
    ).toEqual({
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        mode: "development",
        memberUserId: "member-1",
        developmentSection: "goals",
        createGoal: "true",
      },
    });
  });

  test("preserves scheduled check-in launch context", () => {
    expect(
      workspaceDevelopmentHref("team-1", {
        memberUserId: "member-1",
        section: "check-ins",
        startCheckIn: true,
        templateId: "template-1",
        plannedEventId: "event-1",
        checkInLaunchId: "launch-2",
      }),
    ).toEqual({
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        mode: "development",
        memberUserId: "member-1",
        developmentSection: "check-ins",
        startCheckIn: "true",
        templateId: "template-1",
        plannedEventId: "event-1",
        checkInLaunchId: "launch-2",
      },
    });
  });

  test("opens Workspace Development when no member is specified", () => {
    expect(workspaceDevelopmentHref("team-1")).toEqual({
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        mode: "development",
      },
    });
  });
});
