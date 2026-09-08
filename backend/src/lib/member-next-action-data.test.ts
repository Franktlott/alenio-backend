import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  canInspectMemberNextAction,
  loadMemberNextActionFacts,
  MemberNextActionAccessError,
} from "./member-next-action-data";

describe("member next-action access", () => {
  test("self may inspect self", () => {
    expect(
      canInspectMemberNextAction(
        { userId: "member-1", role: "member" },
        "member-1",
      ),
    ).toBe(true);
  });

  test("owner and team leader may inspect another member", () => {
    for (const role of ["owner", "team_leader"]) {
      expect(
        canInspectMemberNextAction({ userId: "leader-1", role }, "member-1"),
      ).toBe(true);
    }
  });

  test("ordinary members may not inspect another member", () => {
    expect(
      canInspectMemberNextAction(
        { userId: "member-2", role: "member" },
        "member-1",
      ),
    ).toBe(false);
    expect(
      canInspectMemberNextAction(
        { userId: "legacy-admin", role: "admin" },
        "member-1",
      ),
    ).toBe(false);
  });
});

describe("loadMemberNextActionFacts", () => {
  test("loads required-template history and any future member check-in", async () => {
    const queries: Array<{ model: string; args: unknown }> = [];
    let membershipCall = 0;
    const db = {
      teamMember: {
        findUnique: async (args: unknown) => {
          queries.push({ model: "teamMember", args });
          membershipCall += 1;
          if (membershipCall === 1) {
            return {
              userId: "leader-1",
              role: "team_leader",
              user: { timezone: "America/New_York" },
              team: {
                workplaceStandards: JSON.stringify({
                  checkInRequired: true,
                  checkInFrequencyValue: 7,
                  checkInFrequencyUnit: "days",
                  requiredCheckInTemplateId: "template-required",
                  goalsRequired: true,
                  minimumActiveGoals: 1,
                }),
              },
            };
          }
          return { userId: "member-1", user: { timezone: null } };
        },
      },
      oneOnOneMeeting: {
        findMany: async (args: unknown) => {
          queries.push({ model: "oneOnOneMeeting", args });
          return [
            {
              id: "meeting-1",
              publishedAt: new Date("2026-08-01T14:00:00.000Z"),
              createdAt: new Date("2026-08-01T13:00:00.000Z"),
            },
          ];
        },
      },
      calendarEvent: {
        findMany: async (args: unknown) => {
          queries.push({ model: "calendarEvent", args });
          return [{ id: "event-1" }];
        },
      },
      developmentGoal: {
        findMany: async (args: unknown) => {
          queries.push({ model: "developmentGoal", args });
          return [
            {
              id: "goal-1",
              createdAt: new Date("2026-08-01"),
              lastActivityAt: null,
            },
          ];
        },
      },
      task: {
        findMany: async (args: unknown) => {
          queries.push({ model: "task", args });
          return [{ id: "task-1", dueDate: new Date("2026-08-10") }];
        },
      },
      oneOnOneTemplate: {
        findFirst: async (args: unknown) => {
          queries.push({ model: "oneOnOneTemplate", args });
          return { id: "template-required" };
        },
      },
    } as unknown as PrismaClient;

    const facts = await loadMemberNextActionFacts(
      "team-1",
      "member-1",
      "leader-1",
      new Date("2026-08-09T16:00:00.000Z"),
      db,
    );

    expect(facts).toMatchObject({
      teamId: "team-1",
      memberUserId: "member-1",
      timeZone: "America/New_York",
      checkInActionsAvailable: true,
      developmentGoalActionsAvailable: true,
      canScheduleCheckIn: true,
      completedCheckIns: [{ id: "meeting-1" }],
      futureCheckInEventIds: ["event-1"],
      activeDevelopmentGoals: [{ id: "goal-1" }],
      activeAssignedTasks: [{ id: "task-1" }],
    });
    expect(facts.nextRequiredCheckInAt?.toISOString()).toBe(
      "2026-08-09T03:59:59.999Z",
    );
    expect(
      queries.find((query) => query.model === "oneOnOneMeeting")?.args,
    ).toMatchObject({
      where: {
        status: "published",
        templateId: "template-required",
      },
    });
    expect(
      queries.find((query) => query.model === "calendarEvent")?.args,
    ).toMatchObject({
      where: {
        isOneOnOne: true,
        oneOnOneMemberUserId: "member-1",
        approvalStatus: { in: ["approved", "pending"] },
      },
    });
    expect(
      (
        queries.find((query) => query.model === "calendarEvent")?.args as {
          where?: Record<string, unknown>;
        }
      ).where,
    ).not.toHaveProperty("oneOnOneTemplateId");
    expect(
      (
        queries.find((query) => query.model === "calendarEvent")?.args as {
          where?: Record<string, unknown>;
        }
      ).where,
    ).not.toHaveProperty("isHidden");
    expect(
      queries.find((query) => query.model === "developmentGoal")?.args,
    ).toMatchObject({
      where: {
        status: "active",
        archivedAt: null,
      },
    });
  });

  test("rejects cross-member inspection by a regular member before fact queries", async () => {
    let membershipCall = 0;
    const db = {
      teamMember: {
        findUnique: async () => {
          membershipCall += 1;
          if (membershipCall === 1) {
            return {
              userId: "member-2",
              role: "member",
              user: { timezone: null },
              team: { workplaceStandards: null },
            };
          }
          return { userId: "member-1", user: { timezone: null } };
        },
      },
    } as unknown as PrismaClient;

    expect(
      loadMemberNextActionFacts(
        "team-1",
        "member-1",
        "member-2",
        new Date(),
        db,
      ),
    ).rejects.toEqual(
      new MemberNextActionAccessError(
        403,
        "FORBIDDEN",
        "You do not have permission to inspect this team member.",
      ),
    );
  });
});
