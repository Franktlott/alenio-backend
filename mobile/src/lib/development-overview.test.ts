import { describe, expect, test } from "bun:test";
import type { CalendarEvent, TeamMember } from "@/lib/types";
import {
  nextCheckInByMember,
  selectUpcomingDevelopmentCheckIns,
  sortDevelopmentMembers,
} from "./development-overview";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  type MemberStatsRow,
} from "./workplace-standards";

function member(id: string): TeamMember {
  return {
    id: `membership-${id}`,
    userId: id,
    teamId: "team-1",
    role: "member",
    joinedAt: "2026-08-01T12:00:00.000Z",
    user: {
      id,
      name: id,
      email: `${id}@example.com`,
    },
  };
}

function event(
  id: string,
  memberUserId: string,
  startDate: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: "Check-in",
    startDate,
    endDate: startDate,
    allDay: false,
    color: "#684BFF",
    teamId: "team-1",
    createdAt: startDate,
    isOneOnOne: true,
    oneOnOneMemberUserId: memberUserId,
    ...overrides,
  };
}

function stats(
  checkInStatus: "on_track" | "due_soon" | "overdue",
): MemberStatsRow {
  return {
    activeTasks: 0,
    overdueTasks: 0,
    completedTasks: 0,
    streak: 0,
    activeDevGoals: 2,
    standardsCompliance: {
      checkInStatus,
      checkInActionText: "Check-in status",
      goalsStatus: "on_track",
      goalsActionText: "Goals current",
      missingGoals: 0,
      statusBadge: "On track",
      goalsDisplay: "2 active goals",
      minimumActiveGoals: 2,
    },
  };
}

describe("development overview", () => {
  test("returns an empty upcoming state when no check-ins are scheduled", () => {
    expect(
      selectUpcomingDevelopmentCheckIns(
        [],
        new Date("2026-08-30T12:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  test("selects only upcoming check-ins in chronological order", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const result = selectUpcomingDevelopmentCheckIns(
      [
        event("later", "two", "2026-09-02T12:00:00.000Z"),
        event("past", "one", "2026-08-29T12:00:00.000Z"),
        event("soon", "one", "2026-08-31T12:00:00.000Z"),
        event("regular-event", "one", "2026-09-01T12:00:00.000Z", {
          isOneOnOne: false,
        }),
      ],
      now,
    );

    expect(result.map((item) => item.id)).toEqual(["soon", "later"]);
  });

  test("keeps the earliest upcoming check-in for each member", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const byMember = nextCheckInByMember(
      [
        event("second", "one", "2026-09-04T12:00:00.000Z"),
        event("first", "one", "2026-09-01T12:00:00.000Z"),
      ],
      now,
    );

    expect(byMember.get("one")?.id).toBe("first");
  });

  test("uses an event assignee when the explicit member field is absent", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const byMember = nextCheckInByMember(
      [
        event("assigned", "unused", "2026-09-01T12:00:00.000Z", {
          oneOnOneMemberUserId: null,
          assigneeIds: ["assignee"],
        }),
      ],
      now,
    );

    expect(byMember.get("assignee")?.id).toBe("assigned");
  });

  test("places members needing attention before on-track members", () => {
    const members = [member("on-track"), member("attention"), member("due")];
    const result = sortDevelopmentMembers(
      members,
      {
        "on-track": stats("on_track"),
        attention: stats("overdue"),
        due: stats("due_soon"),
      },
      DEFAULT_WORKPLACE_STANDARDS,
    );

    expect(result.map((item) => item.userId)).toEqual([
      "attention",
      "due",
      "on-track",
    ]);
  });
});
