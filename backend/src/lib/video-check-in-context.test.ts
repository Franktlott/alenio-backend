import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  contextIncludesCheckInSelection,
  parseVideoMeetingParticipantIds,
  resolveVideoCheckInContext,
  VideoRoomAccessError,
} from "./video-check-in-context";

describe("video check-in context", () => {
  test("parses unique calendar participant ids and rejects legacy arrays", () => {
    expect(
      parseVideoMeetingParticipantIds(
        JSON.stringify({ assigneeIds: ["leader", "member", "member", 42] }),
      ),
    ).toEqual(["leader", "member"]);
    expect(parseVideoMeetingParticipantIds(JSON.stringify(["member"]))).toEqual([]);
    expect(parseVideoMeetingParticipantIds("not-json")).toEqual([]);
  });

  test("returns only participant/workspace pairs managed by the caller", async () => {
    const prisma = {
      calendarEvent: {
        findUnique: async () => ({
          id: "event-1",
          teamId: "team-1",
          isVideoMeeting: true,
          reminderMinutes: JSON.stringify({
            assigneeIds: ["leader", "member", "outsider"],
          }),
        }),
      },
      conversationParticipant: { findUnique: async () => null },
      teamMember: {
        findUnique: async () => ({ userId: "leader" }),
        findMany: async (args: {
          where: {
            userId?: string | { in: string[] };
            teamId?: string | { in: string[] };
            role?: { in: string[] };
          };
        }) => {
          if (args.where.role) return [{ teamId: "team-1" }];
          if (
            typeof args.where.teamId === "object" &&
            typeof args.where.userId === "object"
          ) {
            return [
              {
                team: { id: "team-1", name: "Workspace" },
                user: {
                  id: "member",
                  name: "Member",
                  email: "member@example.com",
                  image: null,
                },
              },
            ];
          }
          return [];
        },
      },
    } as unknown as PrismaClient;

    const context = await resolveVideoCheckInContext(
      prisma,
      "leader",
      "event-1",
    );

    expect(context).toEqual({
      sourceVideoRoomId: "event-1",
      roomKind: "calendar",
      calendarEventId: "event-1",
      eligiblePairs: [
        {
          workspace: { id: "team-1", name: "Workspace" },
          member: {
            id: "member",
            name: "Member",
            email: "member@example.com",
            image: null,
          },
        },
      ],
    });
    expect(contextIncludesCheckInSelection(context, "team-1", "member")).toBe(true);
    expect(contextIncludesCheckInSelection(context, "team-1", "outsider")).toBe(false);
  });

  test("rejects a calendar room when the caller is not invited", async () => {
    const prisma = {
      calendarEvent: {
        findUnique: async () => ({
          id: "event-1",
          teamId: "team-1",
          isVideoMeeting: true,
          reminderMinutes: JSON.stringify({ assigneeIds: ["member"] }),
        }),
      },
      teamMember: {
        findUnique: async () => ({ userId: "leader" }),
      },
    } as unknown as PrismaClient;

    await expect(
      resolveVideoCheckInContext(prisma, "leader", "event-1"),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Not invited to this meeting",
        status: 403,
      } satisfies Partial<VideoRoomAccessError>),
    );
  });

  test("resolves a group room and preserves multi-workspace choices", async () => {
    const prisma = {
      calendarEvent: { findUnique: async () => null },
      conversationParticipant: {
        findUnique: async () => ({
          conversation: {
            isGroup: true,
            participants: [{ userId: "leader" }, { userId: "member" }],
          },
        }),
      },
      teamMember: {
        findMany: async (args: {
          where: {
            role?: { in: string[] };
            teamId?: { in: string[] };
            userId?: { in: string[] };
          };
        }) => {
          if (args.where.role) {
            return [{ teamId: "team-1" }, { teamId: "team-2" }];
          }
          if (args.where.teamId && args.where.userId) {
            return [
              {
                team: { id: "team-1", name: "One" },
                user: {
                  id: "member",
                  name: "Member",
                  email: "member@example.com",
                  image: null,
                },
              },
              {
                team: { id: "team-2", name: "Two" },
                user: {
                  id: "member",
                  name: "Member",
                  email: "member@example.com",
                  image: null,
                },
              },
            ];
          }
          return [];
        },
      },
    } as unknown as PrismaClient;

    const context = await resolveVideoCheckInContext(
      prisma,
      "leader",
      "group-1",
    );
    expect(context.roomKind).toBe("group");
    expect(context.eligiblePairs.map((pair) => pair.workspace.id)).toEqual([
      "team-1",
      "team-2",
    ]);
  });

  test("resolves a direct-message room with no eligible peer", async () => {
    const prisma = {
      calendarEvent: { findUnique: async () => null },
      conversationParticipant: {
        findUnique: async () => ({
          conversation: {
            isGroup: false,
            participants: [{ userId: "leader" }],
          },
        }),
      },
    } as unknown as PrismaClient;

    const context = await resolveVideoCheckInContext(
      prisma,
      "leader",
      "dm-1",
    );
    expect(context.roomKind).toBe("dm");
    expect(context.eligiblePairs).toEqual([]);
  });

  test("resolves a team room but hides tools from non-leaders", async () => {
    const prisma = {
      calendarEvent: { findUnique: async () => null },
      conversationParticipant: { findUnique: async () => null },
      teamMember: {
        findMany: async (args: {
          where: {
            userId?: string;
            teamId?: string;
            role?: { in: string[] };
          };
        }) => {
          if (args.where.role) return [];
          if (args.where.userId === "member") return [{ teamId: "team-1" }];
          if (args.where.teamId === "team-1") {
            return [{ userId: "member" }, { userId: "peer" }];
          }
          return [];
        },
      },
    } as unknown as PrismaClient;

    const context = await resolveVideoCheckInContext(
      prisma,
      "member",
      "team-1",
    );
    expect(context.roomKind).toBe("team");
    expect(context.eligiblePairs).toEqual([]);
  });
});
