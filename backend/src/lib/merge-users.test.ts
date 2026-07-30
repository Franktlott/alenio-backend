import { describe, expect, test } from "bun:test";
import {
  collectUserForeignKeys,
  mergeProfileFields,
  planConversationCleanup,
  teamRoleRank,
  type MergeableProfile,
} from "./merge-users";

const profile = (overrides: Partial<MergeableProfile> = {}): MergeableProfile => ({
  name: "Frank Lott",
  image: null,
  isAdmin: false,
  emailVerified: false,
  pushToken: null,
  timezone: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  personalBestStreak: 0,
  ...overrides,
});

describe("collectUserForeignKeys", () => {
  test("finds every column that points at User.id", () => {
    const foreignKeys = collectUserForeignKeys();
    const columns = foreignKeys.map((fk) => `${fk.model}.${fk.column}`);

    // A membership, an activity row, a message, and both sides of a two-relation model.
    expect(columns).toContain("TeamMember.userId");
    expect(columns).toContain("TeamActivity.userId");
    expect(columns).toContain("Message.senderId");
    expect(columns).toContain("OwnershipTransfer.fromUserId");
    expect(columns).toContain("OwnershipTransfer.toUserId");
    expect(columns).not.toContain("User.id");
  });

  test("records the unique constraints that could collide during a move", () => {
    const foreignKeys = collectUserForeignKeys();

    const membership = foreignKeys.find((fk) => fk.model === "TeamMember");
    expect(membership?.uniques).toEqual([["userId", "teamId"]]);

    const reaction = foreignKeys.find((fk) => fk.model === "MessageReaction");
    expect(reaction?.uniques).toEqual([["messageId", "userId", "emoji"]]);

    // Nothing constrains who sends a message, so no pre-checks are needed there.
    expect(foreignKeys.find((fk) => fk.model === "Message")?.uniques).toEqual([]);
  });
});

describe("teamRoleRank", () => {
  test("orders workspace roles so the stronger one survives", () => {
    expect(teamRoleRank("owner")).toBeGreaterThan(teamRoleRank("admin"));
    expect(teamRoleRank("admin")).toBeGreaterThan(teamRoleRank("member"));
    expect(teamRoleRank("OWNER")).toBe(teamRoleRank("owner"));
    expect(teamRoleRank(null)).toBe(0);
  });
});

describe("mergeProfileFields", () => {
  test("copies a photo onto a record that has none", () => {
    const updates = mergeProfileFields(profile(), profile({ image: "https://cdn/avatar.png" }));
    expect(updates.image).toBe("https://cdn/avatar.png");
  });

  test("never overwrites a photo the surviving record already has", () => {
    const updates = mergeProfileFields(
      profile({ image: "https://cdn/kept.png" }),
      profile({ image: "https://cdn/other.png" }),
    );
    expect(updates.image).toBeUndefined();
  });

  test("keeps admin access and the longer streak", () => {
    const updates = mergeProfileFields(
      profile({ personalBestStreak: 3 }),
      profile({ isAdmin: true, personalBestStreak: 11 }),
    );
    expect(updates.isAdmin).toBe(true);
    expect(updates.personalBestStreak).toBe(11);
  });

  test("does not downgrade a longer streak on the surviving record", () => {
    const updates = mergeProfileFields(
      profile({ personalBestStreak: 11 }),
      profile({ personalBestStreak: 3 }),
    );
    expect(updates.personalBestStreak).toBeUndefined();
  });

  test("carries a phone number together with its verified flag", () => {
    const updates = mergeProfileFields(
      profile(),
      profile({ phoneNumber: "+15550100", phoneNumberVerified: true }),
    );
    expect(updates).toMatchObject({ phoneNumber: "+15550100", phoneNumberVerified: true });
  });
});

describe("planConversationCleanup", () => {
  const conversation = (
    id: string,
    participantIds: string[],
    messageCount: number,
    createdAt = "2026-01-01T00:00:00.000Z",
  ) => ({ id, isGroup: false, participantIds, messageCount, createdAt });

  test("removes the empty chat-with-yourself the duplicate created", () => {
    const { deleteIds } = planConversationCleanup("me", [conversation("self", ["me"], 0)]);
    expect(deleteIds).toEqual(["self"]);
  });

  test("keeps a collapsed thread that has messages in it", () => {
    const { deleteIds } = planConversationCleanup("me", [conversation("self", ["me"], 4)]);
    expect(deleteIds).toEqual([]);
  });

  test("drops the empty duplicate thread and keeps the one with history", () => {
    const { deleteIds } = planConversationCleanup("me", [
      conversation("empty", ["me", "karyna"], 0),
      conversation("history", ["me", "karyna"], 12),
    ]);
    expect(deleteIds).toEqual(["empty"]);
  });

  test("keeps both threads when each holds messages", () => {
    const { deleteIds } = planConversationCleanup("me", [
      conversation("older", ["me", "karyna"], 2),
      conversation("newer", ["me", "karyna"], 5),
    ]);
    expect(deleteIds).toEqual([]);
  });

  test("leaves group chats alone", () => {
    const { deleteIds } = planConversationCleanup("me", [
      { ...conversation("group", ["me"], 0), isGroup: true },
    ]);
    expect(deleteIds).toEqual([]);
  });

  test("treats a single thread per person as nothing to clean", () => {
    const { deleteIds } = planConversationCleanup("me", [
      conversation("a", ["me", "karyna"], 0),
      conversation("b", ["me", "latia"], 0),
    ]);
    expect(deleteIds).toEqual([]);
  });
});
