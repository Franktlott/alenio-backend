import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  assertTeamMomentumAccess,
  buildTeamMomentumMemberDetail,
  buildTeamMomentumSummary,
  calendarMonthRange,
  getTeamMomentumMemberDetail,
  getTeamMomentumSummary,
  TEAM_MOMENTUM_LEADER_REQUIRED,
  TEAM_MOMENTUM_PLAN_REQUIRED,
  TeamMomentumAccessError,
  teamMomentumPlanEnabled,
} from "./team-momentum";

const now = new Date("2026-08-27T16:00:00.000Z");
const member = (overrides: Record<string, unknown> = {}) => ({
  id: "membership-1",
  userId: "member-1",
  role: "member",
  currentStreak: 3,
  personalBestStreak: 4,
  momentumRunStartedAt: new Date("2026-08-20T12:00:00.000Z"),
  momentumLastQualifiedAt: new Date("2026-08-25T12:00:00.000Z"),
  user: { name: "Member One", email: "one@example.com", image: null },
  ...overrides,
});

describe("Team Momentum access", () => {
  const paid = { hasTeamFeatures: true, status: "active" as const };

  test("requires manager insight role with stable code", () => {
    try {
      assertTeamMomentumAccess({ role: "member" }, paid);
      throw new Error("Expected access check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TeamMomentumAccessError);
      expect((error as TeamMomentumAccessError).code).toBe(TEAM_MOMENTUM_LEADER_REQUIRED);
    }
  });

  test("permits active paid and live trial access but rejects expired plans", () => {
    expect(teamMomentumPlanEnabled(paid)).toBe(true);
    expect(teamMomentumPlanEnabled({ hasTeamFeatures: true, status: "trialing" })).toBe(true);
    expect(teamMomentumPlanEnabled({ hasTeamFeatures: true, status: "expired" })).toBe(false);
    try {
      assertTeamMomentumAccess(
        { role: "team_leader" },
        { hasTeamFeatures: false, status: "active" },
      );
      throw new Error("Expected plan check to fail");
    } catch (error) {
      expect((error as TeamMomentumAccessError).code).toBe(TEAM_MOMENTUM_PLAN_REQUIRED);
    }
  });
});

describe("Team Momentum summary", () => {
  test("uses the supplied workspace timezone for calendar-month boundaries", () => {
    const range = calendarMonthRange(
      new Date("2026-09-01T02:00:00.000Z"),
      "America/New_York",
    );
    expect(range.start.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  test("excludes owners and distinguishes active, stale-history, and no-history members", () => {
    const result = buildTeamMomentumSummary({
      teamId: "team-1",
      now,
      monthStart: new Date("2026-08-01T00:00:00.000Z"),
      monthEnd: new Date("2026-09-01T00:00:00.000Z"),
      members: [
        member(),
        member({
          id: "membership-2",
          userId: "member-2",
          currentStreak: 2,
          momentumLastQualifiedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
        member({ id: "membership-3", userId: "member-3", currentStreak: 0 }),
        member({ id: "owner", userId: "owner", role: "owner" }),
      ],
      credits: [
        { creditedUserId: "member-1", completedAt: new Date("2026-08-20T00:00:00.000Z") },
        { creditedUserId: "member-2", completedAt: new Date("2026-06-01T00:00:00.000Z") },
      ],
      overdueAssignments: [{ userId: "member-1" }, { userId: "member-1" }],
    });

    expect(result.activeCount).toBe(1);
    expect(result.eligibleCount).toBe(3);
    expect(result.groups.strong[0]).toMatchObject({
      userId: "member-1",
      completedThisMonth: 1,
      overdueTaskCount: 2,
    });
    expect(result.groups.readyToRebuild.map((item) => item.userId)).toEqual(["member-2"]);
    expect(result.notEnoughActivity.members.map((item) => item.userId)).toEqual(["member-3"]);
  });

  test("query layer reads canonical credits and assignment projections", async () => {
    const calls: string[] = [];
    const db = {
      team: {
        findUnique: async () => ({ timezone: "America/Chicago", members: [] }),
      },
      teamMember: {
        findUnique: async () => ({
          role: "team_leader",
          user: { timezone: "UTC" },
        }),
        findMany: async () => {
          calls.push("members");
          return [member()];
        },
      },
      teamSubscription: {
        findUnique: async () => ({
          teamId: "team-1",
          plan: "team",
          status: "active",
          trialStartedAt: null,
          trialEndsAt: null,
        }),
        updateMany: async () => ({ count: 0 }),
      },
      momentumCompletionCredit: {
        findMany: async () => {
          calls.push("credits");
          return [
            {
              creditedUserId: "member-1",
              completedAt: new Date("2026-08-20T00:00:00.000Z"),
            },
          ];
        },
      },
      taskAssignment: {
        findMany: async () => {
          calls.push("assignments");
          return [{ userId: "member-1" }];
        },
      },
    } as unknown as PrismaClient;

    const result = await getTeamMomentumSummary("team-1", "leader-1", now, db);
    expect(calls.sort()).toEqual(["assignments", "credits", "members"]);
    expect(result.groups.strong[0]?.completedThisMonth).toBe(1);
    expect(result.groups.strong[0]?.overdueTaskCount).toBe(1);
  });
});

describe("Team Momentum member detail", () => {
  test("caps canonical current-run evidence and hides incognito titles", () => {
    const detail = buildTeamMomentumMemberDetail({
      teamId: "team-1",
      now,
      monthStart: new Date("2026-08-01T00:00:00.000Z"),
      monthEnd: new Date("2026-09-01T00:00:00.000Z"),
      member: member(),
      credits: [
        {
          id: "on-time-3",
          sourceTaskId: "deleted-task",
          creditedUserId: "member-1",
          sourceTaskTitle: "Private task",
          sourceTaskIncognito: true,
          dueAt: new Date("2026-08-25T13:00:00.000Z"),
          completedAt: new Date("2026-08-25T12:00:00.000Z"),
          onTime: true,
        },
        {
          id: "on-time-2",
          sourceTaskId: "task-2",
          creditedUserId: "member-1",
          sourceTaskTitle: "Second",
          sourceTaskIncognito: false,
          dueAt: new Date("2026-08-24T13:00:00.000Z"),
          completedAt: new Date("2026-08-24T12:00:00.000Z"),
          onTime: true,
        },
        {
          id: "late",
          sourceTaskId: "task-late",
          creditedUserId: "member-1",
          sourceTaskTitle: "Late",
          sourceTaskIncognito: false,
          dueAt: new Date("2026-08-19T11:00:00.000Z"),
          completedAt: new Date("2026-08-19T12:00:00.000Z"),
          onTime: false,
        },
        {
          id: "old-on-time",
          sourceTaskId: "task-old",
          creditedUserId: "member-1",
          sourceTaskTitle: "Old",
          sourceTaskIncognito: false,
          dueAt: new Date("2026-08-18T13:00:00.000Z"),
          completedAt: new Date("2026-08-18T12:00:00.000Z"),
          onTime: true,
        },
      ],
      tasks: [
        {
          id: "open-private",
          title: "Hidden active title",
          incognito: true,
          priority: "high",
          status: "todo",
          isJoint: false,
          dueDate: null,
        },
        {
          id: "overdue",
          title: "Follow up",
          incognito: false,
          priority: "urgent",
          status: "todo",
          isJoint: true,
          dueDate: new Date("2026-08-20T00:00:00.000Z"),
        },
      ],
      availableTaskIds: new Set(["task-2", "task-late", "task-old"]),
      currentRunLimit: 1,
    });

    expect(detail.currentRun).toMatchObject({
      totalCount: 2,
      returnedCount: 1,
      truncated: true,
    });
    expect(detail.currentRun.completions[0]).toMatchObject({
      title: null,
      sourceTaskAvailable: false,
    });
    expect(detail.latestStreakBreakingLateCompletion?.streakBeforeBreak).toBe(1);
    expect(detail.activeTasks[0]?.title).toBeNull();
    expect(detail.overdueTasks[0]?.title).toBe("Follow up");
  });

  test("query layer permits leaders and a member viewing their own scoped detail", async () => {
    const creditWhere: unknown[] = [];
    const taskWhere: unknown[] = [];
    const db = {
      team: {
        findUnique: async () => ({ timezone: "America/Chicago", members: [] }),
      },
      teamMember: {
        findUnique: async ({ where }: any) =>
          where.userId_teamId.userId === "leader-1"
            ? { role: "team_leader", user: { timezone: "UTC" } }
            : member(),
      },
      teamSubscription: {
        findUnique: async () => ({
          teamId: "team-1",
          plan: "team",
          status: "trialing",
          trialStartedAt: now,
          trialEndsAt: new Date("2026-09-01T00:00:00.000Z"),
        }),
        updateMany: async () => ({ count: 0 }),
      },
      momentumCompletionCredit: {
        findMany: async ({ where }: any) => {
          creditWhere.push(where);
          return [
            {
              id: "credit-1",
              sourceTaskId: "deleted-task",
              creditedUserId: "member-1",
              sourceTaskTitle: "Surviving evidence",
              sourceTaskIncognito: false,
              dueAt: new Date("2026-08-25T13:00:00.000Z"),
              completedAt: new Date("2026-08-25T12:00:00.000Z"),
              onTime: true,
            },
          ];
        },
      },
      task: {
        findMany: async ({ where }: any) => {
          taskWhere.push(where);
          return [];
        },
      },
    } as unknown as PrismaClient;

    const detail = await getTeamMomentumMemberDetail(
      "team-1",
      "member-1",
      "leader-1",
      25,
      now,
      db,
    );

    expect(creditWhere).toEqual([
      {
        teamId: "team-1",
        creditedUserId: "member-1",
        revokedAt: null,
      },
    ]);
    expect(taskWhere[0]).toMatchObject({
      teamId: "team-1",
      kind: "workspace_task",
      status: { not: "done" },
      assignments: { some: { userId: "member-1" } },
    });
    expect(taskWhere[1]).toEqual({
      teamId: "team-1",
      id: { in: ["deleted-task"] },
    });
    expect(detail.currentRun.completions[0]).toMatchObject({
      sourceTaskId: "deleted-task",
      sourceTaskAvailable: false,
      title: "Surviving evidence",
    });

    const ownDetail = await getTeamMomentumMemberDetail(
      "team-1",
      "member-1",
      "member-1",
      25,
      now,
      db,
    );
    expect(ownDetail.member.userId).toBe("member-1");
  });
});
