import { describe, expect, test } from "bun:test";
import type { MemberNextActionId } from "../types";
import {
  evaluateMemberNextAction,
  MEMBER_NEXT_ACTION_COPY,
  type MemberNextActionFacts,
} from "./member-next-action-engine";

const NOW = new Date("2026-08-09T16:00:00.000Z");

function facts(
  overrides: Partial<MemberNextActionFacts> = {},
): MemberNextActionFacts {
  return {
    teamId: "team-1",
    memberUserId: "member-1",
    timeZone: "America/New_York",
    checkInActionsAvailable: false,
    developmentGoalActionsAvailable: true,
    canScheduleCheckIn: true,
    completedCheckIns: [],
    nextRequiredCheckInAt: null,
    futureCheckInEventIds: ["event-1"],
    activeDevelopmentGoals: [
      {
        id: "goal-current",
        createdAt: new Date("2026-08-01T16:00:00.000Z"),
        lastActivityAt: new Date("2026-08-01T16:00:00.000Z"),
      },
    ],
    activeAssignedTasks: [],
    ...overrides,
  };
}

function id(overrides: Partial<MemberNextActionFacts>): MemberNextActionId {
  return evaluateMemberNextAction(facts(overrides), NOW).id;
}

describe("evaluateMemberNextAction", () => {
  test("defines exactly the eight requested actions and exact copy", () => {
    expect(Object.keys(MEMBER_NEXT_ACTION_COPY)).toEqual([
      "first_check_in",
      "overdue_check_in",
      "schedule_next_check_in",
      "no_active_development_goals",
      "development_goal_review_due",
      "overdue_tasks",
      "tasks_due_soon",
      "everything_up_to_date",
    ]);
    expect(MEMBER_NEXT_ACTION_COPY).toEqual({
      first_check_in: {
        priority: 1,
        title: "Start first check-in",
        copy: "This member hasn't completed their first development check-in yet.",
        ctaLabel: "Start Check-In",
      },
      overdue_check_in: {
        priority: 2,
        title: "Complete overdue check-in",
        copy: "This member's scheduled check-in is overdue.",
        ctaLabel: "Start Check-In",
      },
      schedule_next_check_in: {
        priority: 3,
        title: "Schedule next check-in",
        copy: "Keep development on track by scheduling the next conversation.",
        ctaLabel: "Schedule Check-In",
      },
      no_active_development_goals: {
        priority: 4,
        title: "Create a development goal",
        copy: "Set a clear area of focus to support this member's growth.",
        ctaLabel: "Create Goal",
      },
      development_goal_review_due: {
        priority: 5,
        title: "Review development goals",
        copy: "One or more development goals are ready for a progress review.",
        ctaLabel: "Review Goals",
      },
      overdue_tasks: {
        priority: 6,
        title: "Review overdue tasks",
        copy: "This member has overdue work that needs attention.",
        ctaLabel: "View Tasks",
      },
      tasks_due_soon: {
        priority: 7,
        title: "Review upcoming tasks",
        copy: "This member has work due soon.",
        ctaLabel: "View Tasks",
      },
      everything_up_to_date: {
        priority: 8,
        title: "Everything is on track",
        copy: "No immediate actions are needed for this team member.",
        ctaLabel: "View Activity",
      },
    });
  });

  test("priority 1: no completed check-in", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        futureCheckInEventIds: [],
      }),
    ).toBe("first_check_in");
  });

  test("priority 2: required next check-in is overdue", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [{ id: "meeting-1", completedAt: new Date("2026-07-01") }],
        nextRequiredCheckInAt: new Date(NOW.getTime() - 1),
        futureCheckInEventIds: [],
      }),
    ).toBe("overdue_check_in");
  });

  test("priority 3: completed check-in has no future schedule", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [{ id: "meeting-1", completedAt: new Date("2026-08-01") }],
        nextRequiredCheckInAt: new Date("2026-09-01"),
        futureCheckInEventIds: [],
      }),
    ).toBe("schedule_next_check_in");
  });

  test("any future scheduled check-in advances past check-in actions", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [],
        futureCheckInEventIds: ["scheduled-check-in"],
        activeDevelopmentGoals: [],
      }),
    ).toBe("no_active_development_goals");

    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [
          { id: "meeting-1", completedAt: new Date("2026-07-01") },
        ],
        nextRequiredCheckInAt: new Date(NOW.getTime() - 1),
        futureCheckInEventIds: ["scheduled-check-in"],
        activeDevelopmentGoals: [],
      }),
    ).toBe("no_active_development_goals");
  });

  test("keeps manager-only scheduling visible but removes its CTA", () => {
    const result = evaluateMemberNextAction(
      facts({
        checkInActionsAvailable: true,
        canScheduleCheckIn: false,
        completedCheckIns: [{ id: "meeting-1", completedAt: new Date("2026-08-01") }],
        nextRequiredCheckInAt: new Date("2026-09-01"),
        futureCheckInEventIds: [],
      }),
      NOW,
    );
    expect(result.id).toBe("schedule_next_check_in");
    expect(result.cta).toBeNull();
  });

  test("a next check-in due exactly now is not overdue", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [{ id: "meeting-1", completedAt: new Date("2026-08-01") }],
        nextRequiredCheckInAt: NOW,
      }),
    ).toBe("everything_up_to_date");
  });

  test("priority 4: no active development goals", () => {
    expect(id({ activeDevelopmentGoals: [] })).toBe(
      "no_active_development_goals",
    );
  });

  test("skips goal actions when development goals are not required", () => {
    expect(
      id({
        developmentGoalActionsAvailable: false,
        activeDevelopmentGoals: [],
        activeAssignedTasks: [
          { id: "task-overdue", dueAt: new Date(NOW.getTime() - 1) },
        ],
      }),
    ).toBe("overdue_tasks");

    expect(
      id({
        developmentGoalActionsAvailable: false,
        activeDevelopmentGoals: [
          {
            id: "goal-due",
            createdAt: new Date("2026-01-01"),
            lastActivityAt: null,
          },
        ],
      }),
    ).toBe("everything_up_to_date");
  });

  test("priority 5: goal review is due at 21 local calendar days", () => {
    expect(
      id({
        activeDevelopmentGoals: [
          {
            id: "goal-1",
            createdAt: new Date("2026-07-19T23:30:00.000Z"),
            lastActivityAt: null,
          },
        ],
      }),
    ).toBe("development_goal_review_due");
  });

  test("goal review is not due at 20 local calendar days", () => {
    expect(
      id({
        activeDevelopmentGoals: [
          {
            id: "goal-1",
            createdAt: new Date("2026-07-20T16:00:00.000Z"),
            lastActivityAt: null,
          },
        ],
      }),
    ).toBe("everything_up_to_date");
  });

  test("lastActivityAt takes precedence over goal creation", () => {
    expect(
      id({
        activeDevelopmentGoals: [
          {
            id: "goal-1",
            createdAt: new Date("2026-01-01"),
            lastActivityAt: new Date("2026-08-01"),
          },
        ],
      }),
    ).toBe("everything_up_to_date");
  });

  test("priority 6: active assigned task is overdue", () => {
    expect(
      id({
        activeAssignedTasks: [
          { id: "task-1", dueAt: new Date(NOW.getTime() - 1) },
        ],
      }),
    ).toBe("overdue_tasks");
  });

  test("priority 7: task due exactly now is due soon", () => {
    expect(
      id({ activeAssignedTasks: [{ id: "task-1", dueAt: NOW }] }),
    ).toBe("tasks_due_soon");
  });

  test("due-soon includes the end of the third local calendar day", () => {
    expect(
      id({
        activeAssignedTasks: [
          { id: "task-1", dueAt: new Date("2026-08-13T03:59:59.999Z") },
        ],
      }),
    ).toBe("tasks_due_soon");
  });

  test("due-soon excludes the fourth local calendar day", () => {
    expect(
      id({
        activeAssignedTasks: [
          { id: "task-1", dueAt: new Date("2026-08-13T04:00:00.000Z") },
        ],
      }),
    ).toBe("everything_up_to_date");
  });

  test("priority 8: returns on-track fallback with routing metadata", () => {
    const result = evaluateMemberNextAction(facts(), NOW);
    expect(result).toMatchObject({
      id: "everything_up_to_date",
      priority: 8,
      affectedEntityIds: [],
      generatedAt: NOW.toISOString(),
      cta: {
        route: "/(app)/chat",
        params: { teamId: "team-1", memberUserId: "member-1" },
      },
    });
  });

  test("strictly returns the first match when every condition applies", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [],
        futureCheckInEventIds: [],
        activeDevelopmentGoals: [],
        activeAssignedTasks: [
          { id: "task-overdue", dueAt: new Date(NOW.getTime() - 1) },
        ],
      }),
    ).toBe("first_check_in");
  });

  test("an overdue check-in wins over missing schedule, goals, and tasks", () => {
    expect(
      id({
        checkInActionsAvailable: true,
        completedCheckIns: [{ id: "meeting-1", completedAt: new Date("2026-07-01") }],
        nextRequiredCheckInAt: new Date(NOW.getTime() - 1),
        futureCheckInEventIds: [],
        activeDevelopmentGoals: [],
        activeAssignedTasks: [
          { id: "task-overdue", dueAt: new Date(NOW.getTime() - 1) },
        ],
      }),
    ).toBe("overdue_check_in");
  });

  test("goal review wins over overdue tasks, which win over due-soon tasks", () => {
    const goalDue = {
      id: "goal-due",
      createdAt: new Date("2026-01-01"),
      lastActivityAt: null,
    };
    const overdue = { id: "task-overdue", dueAt: new Date(NOW.getTime() - 1) };
    const dueSoon = { id: "task-soon", dueAt: new Date(NOW.getTime() + 1) };
    expect(
      id({
        activeDevelopmentGoals: [goalDue],
        activeAssignedTasks: [overdue, dueSoon],
      }),
    ).toBe("development_goal_review_due");
    expect(
      id({
        activeAssignedTasks: [overdue, dueSoon],
      }),
    ).toBe("overdue_tasks");
  });

  test("check-in actions are skipped when check-ins are unavailable", () => {
    expect(
      id({
        checkInActionsAvailable: false,
        completedCheckIns: [],
        futureCheckInEventIds: [],
      }),
    ).toBe("everything_up_to_date");
  });

  test("goal actions route to Workspace Development", () => {
    const createGoal = evaluateMemberNextAction(
      facts({ activeDevelopmentGoals: [] }),
      NOW,
    );
    expect(createGoal.cta).toEqual({
      route: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "goals",
        developmentSection: "goals",
        createGoal: "true",
      },
    });

    const reviewGoal = evaluateMemberNextAction(
      facts({
        activeDevelopmentGoals: [
          {
            id: "goal-old",
            createdAt: new Date("2026-01-01"),
            lastActivityAt: null,
          },
        ],
      }),
      NOW,
    );
    expect(reviewGoal.cta).toEqual({
      route: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "goals",
        developmentSection: "goals",
      },
    });
  });
});
