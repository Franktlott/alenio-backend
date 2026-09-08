import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  buildDailyParticipantEjectBody,
  isUserVideoRoomHost,
} from "./video-host-access";

function prismaStub({
  event = null,
  membership = null,
  conversationParticipant = null,
  managerMemberships = [],
}: {
  event?: { createdById: string; teamId: string } | null;
  membership?: { role: string } | null;
  conversationParticipant?: {
    role: string;
    conversation: { teamId: string | null };
  } | null;
  managerMemberships?: { teamId: string }[];
}) {
  return {
    calendarEvent: {
      findUnique: async () => event,
    },
    teamMember: {
      findUnique: async () => membership,
      findMany: async () => managerMemberships,
    },
    conversationParticipant: {
      findUnique: async () => conversationParticipant,
    },
  } as unknown as PrismaClient;
}

describe("video host access", () => {
  test("bans authenticated users but only ejects anonymous guests", () => {
    expect(buildDailyParticipantEjectBody("session-1", "user-1")).toEqual({
      ids: ["session-1"],
      user_ids: ["user-1"],
      ban: true,
    });
    expect(buildDailyParticipantEjectBody("session-2", null)).toEqual({
      ids: ["session-2"],
      ban: false,
    });
  });

  test("calendar creator and workspace leaders are hosts", async () => {
    const creatorPrisma = prismaStub({
      event: { createdById: "creator", teamId: "team-1" },
    });
    expect(
      await isUserVideoRoomHost(creatorPrisma, "creator", "event-1"),
    ).toBe(true);

    const leaderPrisma = prismaStub({
      event: { createdById: "creator", teamId: "team-1" },
      membership: { role: "team_leader" },
    });
    expect(
      await isUserVideoRoomHost(leaderPrisma, "leader", "event-1"),
    ).toBe(true);
  });

  test("conversation owners are hosts but ordinary members are not", async () => {
    const ownerPrisma = prismaStub({
      conversationParticipant: {
        role: "owner",
        conversation: { teamId: null },
      },
    });
    expect(
      await isUserVideoRoomHost(ownerPrisma, "owner", "conversation-1"),
    ).toBe(true);

    const memberPrisma = prismaStub({
      conversationParticipant: {
        role: "member",
        conversation: { teamId: null },
      },
    });
    expect(
      await isUserVideoRoomHost(memberPrisma, "member", "conversation-1"),
    ).toBe(false);
  });

  test("workspace leaders host team chat rooms", async () => {
    const prisma = prismaStub({
      managerMemberships: [{ teamId: "team-1" }],
    });
    expect(
      await isUserVideoRoomHost(
        prisma,
        "leader",
        "chat-team-1-general",
      ),
    ).toBe(true);
  });
});
