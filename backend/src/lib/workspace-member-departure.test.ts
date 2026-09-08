import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  cleanupWorkspaceMemberDeparture,
  cleanupWorkspaceMembersDeparture,
  DEVELOPMENT_GOAL_ARCHIVE_REASON_MEMBER_DEPARTURE,
  listFormerWorkspaceMembers,
} from "./workspace-member-departure";

describe("workspace member departure", () => {
  test("archives development goals instead of deleting them", async () => {
    const archivedAt = new Date("2026-08-10T12:00:00.000Z");
    let developmentGoalUpdate: unknown;
    const db = {
      oneOnOneMeeting: {
        deleteMany: async () => ({ count: 2 }),
      },
      developmentGoal: {
        updateMany: async (args: unknown) => {
          developmentGoalUpdate = args;
          return { count: 3 };
        },
      },
      task: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;

    await expect(
      cleanupWorkspaceMemberDeparture(db, "team-1", "member-1", archivedAt),
    ).resolves.toEqual({
      deletedDraftCheckIns: 2,
      archivedDevelopmentGoals: 3,
      closedTasks: 0,
    });
    expect(developmentGoalUpdate).toEqual({
      where: {
        teamId: "team-1",
        memberUserId: "member-1",
        archivedAt: null,
      },
      data: {
        archivedAt,
        archiveReason: DEVELOPMENT_GOAL_ARCHIVE_REASON_MEMBER_DEPARTURE,
      },
    });
  });

  test("former-member reads include archived goals and perform no writes", async () => {
    let writes = 0;
    const db = {
      teamMember: {
        findMany: async () => [{ userId: "active-1" }],
      },
      oneOnOneMeeting: {
        groupBy: async () => [{ memberUserId: "former-check-in" }],
      },
      developmentGoal: {
        groupBy: async () => [
          { memberUserId: "former-goal" },
          { memberUserId: "active-1" },
        ],
        updateMany: async () => {
          writes += 1;
          return { count: 0 };
        },
        deleteMany: async () => {
          writes += 1;
          return { count: 0 };
        },
      },
      user: {
        findMany: async () => [
          {
            id: "former-check-in",
            name: "Check In",
            email: "checkin@example.com",
            image: null,
            _count: { teamMembers: 0 },
          },
          {
            id: "former-goal",
            name: "Goal",
            email: "goal@example.com",
            image: null,
            _count: { teamMembers: 1 },
          },
        ],
      },
    } as unknown as PrismaClient;

    const rows = await listFormerWorkspaceMembers(db, "team-1");

    expect(rows.map((row) => row.userId).sort()).toEqual([
      "former-check-in",
      "former-goal",
    ]);
    expect(writes).toBe(0);
  });

  test("bulk departure cleanup processes every selected member", async () => {
    const cleanedDrafts: string[] = [];
    const archivedGoals: string[] = [];
    const db = {
      oneOnOneMeeting: {
        deleteMany: async ({ where }: { where: { memberUserId: string } }) => {
          cleanedDrafts.push(where.memberUserId);
          return { count: 1 };
        },
      },
      developmentGoal: {
        updateMany: async ({ where }: { where: { memberUserId: string } }) => {
          archivedGoals.push(where.memberUserId);
          return { count: 1 };
        },
      },
      task: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;

    await cleanupWorkspaceMembersDeparture(
      db,
      "team-1",
      ["member-1", "member-2"],
      new Date("2026-08-24T12:00:00.000Z"),
    );

    expect(cleanedDrafts).toEqual(["member-1", "member-2"]);
    expect(archivedGoals).toEqual(["member-1", "member-2"]);
  });

  test("closes departure tasks administratively without invoking Momentum", async () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    let taskUpdate: unknown;
    const db = {
      oneOnOneMeeting: { deleteMany: async () => ({ count: 0 }) },
      developmentGoal: { updateMany: async () => ({ count: 0 }) },
      task: {
        findMany: async () => [
          { id: "feedback-task", description: null, oneOnOneMeetingId: "meeting-1" },
        ],
        updateMany: async (args: unknown) => {
          taskUpdate = args;
          return { count: 1 };
        },
      },
      momentumCompletionCredit: {
        upsert: () => {
          throw new Error("departure closure must not create Momentum credit");
        },
      },
    } as unknown as PrismaClient;

    await expect(
      cleanupWorkspaceMemberDeparture(db, "team-1", "member-1", now),
    ).resolves.toMatchObject({ closedTasks: 1 });
    expect(taskUpdate).toEqual({
      where: { id: { in: ["feedback-task"] } },
      data: { status: "done", completedAt: now },
    });
  });
});
