import { describe, expect, test } from "bun:test";
import type {
  DevelopmentGoal,
  OneOnOneMeeting,
} from "@/lib/member-profile-api";
import type { MemberStatsRow } from "@/lib/workplace-standards";
import { DEFAULT_WORKPLACE_STANDARDS } from "@/lib/workplace-standards";
import {
  activeMemberGoals,
  memberDevelopmentStatus,
  recentMemberCheckIns,
} from "./member-development-preview";

function stats(
  checkInStatus: NonNullable<
    MemberStatsRow["standardsCompliance"]
  >["checkInStatus"],
  goalsStatus: NonNullable<
    MemberStatsRow["standardsCompliance"]
  >["goalsStatus"],
  activeDevGoals = 2,
  missingGoals = 0,
): MemberStatsRow {
  return {
    activeTasks: 0,
    overdueTasks: 0,
    completedTasks: 0,
    streak: 0,
    activeDevGoals,
    standardsCompliance: {
      checkInStatus,
      checkInActionText: "",
      goalsStatus,
      goalsActionText: "",
      missingGoals,
      statusBadge: "On track",
      goalsDisplay: `${activeDevGoals}/${DEFAULT_WORKPLACE_STANDARDS.minimumActiveGoals}`,
      minimumActiveGoals: DEFAULT_WORKPLACE_STANDARDS.minimumActiveGoals,
    },
  };
}

function meeting(id: string, createdAt: string): OneOnOneMeeting {
  return {
    id,
    teamId: "team-1",
    memberUserId: "member-1",
    templateId: null,
    templateTitle: "Check-in",
    templateFields: [],
    responses: {},
    status: "published",
    publishedAt: createdAt,
    createdById: "leader-1",
    createdAt,
  };
}

function goal(id: string, status: DevelopmentGoal["status"]): DevelopmentGoal {
  return {
    id,
    teamId: "team-1",
    memberUserId: "member-1",
    skill: id,
    description: null,
    dueDate: null,
    priority: "normal",
    steps: [],
    completedStepIndexes: [],
    completedStepDates: {},
    completedStepCount: 0,
    totalStepCount: 0,
    progressPercent: 0,
    status,
    closedAt: null,
    archivedAt: null,
    archiveReason: null,
    isArchived: false,
    readOnly: false,
    createdById: "leader-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    notes: [],
  };
}

describe("member development preview", () => {
  test("prioritizes overdue check-ins, missing goals, and due-soon status", () => {
    expect(
      memberDevelopmentStatus(
        stats("overdue", "missing_goals", 1, 1),
        DEFAULT_WORKPLACE_STANDARDS,
      ).level,
    ).toBe("needs_attention");
    expect(
      memberDevelopmentStatus(
        stats("on_track", "missing_goals", 1, 1),
        DEFAULT_WORKPLACE_STANDARDS,
      ),
    ).toMatchObject({
      level: "needs_attention",
      title: "Needs attention",
    });
    expect(
      memberDevelopmentStatus(
        stats("due_soon", "on_track"),
        DEFAULT_WORKPLACE_STANDARDS,
      ).level,
    ).toBe("due_soon");
    expect(
      memberDevelopmentStatus(
        stats("on_track", "on_track"),
        DEFAULT_WORKPLACE_STANDARDS,
      ).level,
    ).toBe("on_track");
  });

  test("separates 'nothing is required' from 'measured and passing'", () => {
    const noStandards = {
      ...DEFAULT_WORKPLACE_STANDARDS,
      checkInRequired: false,
      goalsRequired: false,
    };

    expect(
      memberDevelopmentStatus(stats("not_required", "not_required"), noStandards),
    ).toMatchObject({
      level: "not_required",
      title: "No standards required",
    });

    // Waived for one person while the workspace still asks it of everyone else.
    expect(
      memberDevelopmentStatus(
        stats("not_required", "not_required"),
        DEFAULT_WORKPLACE_STANDARDS,
      ).level,
    ).toBe("not_required");
  });

  test("a standard that is still switched on keeps its own verdict", () => {
    const goalsOnly = {
      ...DEFAULT_WORKPLACE_STANDARDS,
      checkInRequired: false,
    };

    // An overdue check-in cannot count against someone who is not asked for one.
    expect(
      memberDevelopmentStatus(stats("overdue", "on_track"), goalsOnly).level,
    ).toBe("on_track");
    expect(
      memberDevelopmentStatus(stats("overdue", "missing_goals", 1, 1), goalsOnly)
        .level,
    ).toBe("needs_attention");
  });

  test("returns the newest two check-ins", () => {
    expect(
      recentMemberCheckIns([
        meeting("old", "2026-06-01T00:00:00.000Z"),
        meeting("new", "2026-08-01T00:00:00.000Z"),
        meeting("middle", "2026-07-01T00:00:00.000Z"),
      ]).map((item) => item.id),
    ).toEqual(["new", "middle"]);
  });

  test("keeps only active goals", () => {
    expect(
      activeMemberGoals([
        goal("active", "active"),
        goal("inactive", "inactive"),
        goal("closed", "closed"),
      ]).map((item) => item.id),
    ).toEqual(["active"]);
  });
});
