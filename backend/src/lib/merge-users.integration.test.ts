import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { buildDmPairKey } from "./dm-pair-key";
import { findDuplicateUserCandidates, MergeUsersError, mergeUserAccounts } from "./merge-users";

/**
 * Exercises the real merge against a real Postgres, because the operation deletes a row and
 * every unique constraint it has to dodge lives in the database rather than in the code.
 *
 * Point DATABASE_URL at a throwaway database and run:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:54329/merge_test \
 *   MERGE_INTEGRATION=1 bun test src/lib/merge-users.integration.test.ts
 */
const enabled = process.env.MERGE_INTEGRATION === "1";
const prisma = new PrismaClient();

const LEGACY = "legacy-frank";
const SESSION = "session-frank";
const TEAMMATE = "karyna";
const TEAM = "team-wawa";
const MESSAGE = "msg-1";
const TASK = "task-1";
const DM_WITH_HISTORY = "dm-history";
const DM_EMPTY_DUPLICATE = "dm-empty";
const DM_WITH_SELF = "dm-self";

async function resetDatabase() {
  // Cascades from Team and User clear everything the seed creates.
  await prisma.conversation.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});
}

/**
 * One person split across two records: an older one holding the workspace history, and the
 * one their current session binds to, which is where the uploaded photo landed.
 */
async function seed() {
  await prisma.user.createMany({
    data: [
      {
        id: LEGACY,
        name: "Frank Lott",
        email: "frank@personal.example",
        image: null,
        isAdmin: true,
        emailVerified: true,
        personalBestStreak: 9,
        timezone: "America/New_York",
      },
      {
        id: SESSION,
        name: "Frank Lott",
        email: "franklott@work.example",
        image: "https://storage.example/users/session-frank/profile/avatar",
        isAdmin: false,
        personalBestStreak: 2,
      },
      { id: TEAMMATE, name: "Karyna Mulero", email: "karyna@work.example" },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM,
      name: "Wawa #5101",
      inviteCode: "WAWA5101",
      members: {
        create: [
          { userId: LEGACY, role: "owner", currentStreak: 7 },
          { userId: SESSION, role: "member", currentStreak: 2 },
          { userId: TEAMMATE, role: "member" },
        ],
      },
    },
  });

  // The mixed-avatar symptom: the same person's activity split across both records.
  await prisma.teamActivity.createMany({
    data: [
      { teamId: TEAM, userId: LEGACY, type: "task_completed" },
      { teamId: TEAM, userId: LEGACY, type: "task_completed" },
      { teamId: TEAM, userId: SESSION, type: "task_completed" },
      { teamId: TEAM, userId: null, type: "member_joined" },
    ],
  });

  await prisma.message.create({
    data: { id: MESSAGE, teamId: TEAM, senderId: LEGACY, content: "Morning" },
  });
  await prisma.messageReaction.createMany({
    data: [
      { messageId: MESSAGE, userId: LEGACY, emoji: "👍" },
      { messageId: MESSAGE, userId: SESSION, emoji: "👍" },
      { messageId: MESSAGE, userId: LEGACY, emoji: "🎉" },
    ],
  });

  await prisma.task.create({
    data: {
      id: TASK,
      teamId: TEAM,
      title: "Activity update",
      creatorId: LEGACY,
      assignments: { create: [{ userId: LEGACY }, { userId: SESSION }] },
    },
  });

  await prisma.joinRequest.createMany({
    data: [
      { teamId: TEAM, userId: LEGACY, status: "pending" },
      { teamId: TEAM, userId: SESSION, status: "pending" },
    ],
  });

  await prisma.calendarConnection.createMany({
    data: [
      { userId: LEGACY, provider: "google", refreshTokenEnc: "legacy" },
      { userId: SESSION, provider: "google", refreshTokenEnc: "session" },
      { userId: LEGACY, provider: "microsoft", refreshTokenEnc: "legacy-ms" },
    ],
  });

  await prisma.conversation.create({
    data: {
      id: DM_WITH_HISTORY,
      dmPairKey: buildDmPairKey(TEAMMATE, LEGACY),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      participants: { create: [{ userId: TEAMMATE }, { userId: LEGACY }] },
      messages: {
        create: [
          { senderId: LEGACY, content: "hi" },
          { senderId: TEAMMATE, content: "hey" },
        ],
      },
    },
  });
  await prisma.conversation.create({
    data: {
      id: DM_EMPTY_DUPLICATE,
      dmPairKey: buildDmPairKey(TEAMMATE, SESSION),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      participants: { create: [{ userId: TEAMMATE }, { userId: SESSION }] },
    },
  });
  await prisma.conversation.create({
    data: {
      id: DM_WITH_SELF,
      dmPairKey: buildDmPairKey(LEGACY, SESSION),
      participants: { create: [{ userId: LEGACY }, { userId: SESSION }] },
    },
  });

  const hour = 60 * 60 * 1000;
  await prisma.session.createMany({
    data: [
      {
        id: "expired-legacy",
        userId: LEGACY,
        token: "expired-token",
        expiresAt: new Date(Date.now() - hour),
      },
      {
        id: "live-session",
        userId: SESSION,
        token: "live-token",
        expiresAt: new Date(Date.now() + hour),
      },
    ],
  });
}

describe.skipIf(!enabled)("mergeUserAccounts against Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  test("a dry run reports the work without changing anything", async () => {
    const report = await mergeUserAccounts({
      sourceId: LEGACY,
      targetId: SESSION,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.rowsMoved).toBeGreaterThan(0);
    expect(report.rowsDropped).toBeGreaterThan(0);

    expect(await prisma.user.count({ where: { id: LEGACY } })).toBe(1);
    expect(await prisma.teamActivity.count({ where: { userId: LEGACY } })).toBe(2);
    expect(await prisma.teamMember.count({ where: { teamId: TEAM } })).toBe(3);
    expect(await prisma.conversation.count()).toBe(3);
  });

  test("refuses to merge away the record with a live session", async () => {
    const attempt = mergeUserAccounts({ sourceId: SESSION, targetId: LEGACY, dryRun: true });
    await expect(attempt).rejects.toThrow(MergeUsersError);
    await expect(attempt).rejects.toThrow(/active session/i);
  });

  test("allows that direction when forced", async () => {
    const report = await mergeUserAccounts({
      sourceId: SESSION,
      targetId: LEGACY,
      dryRun: true,
      force: true,
    });
    expect(report.target.id).toBe(LEGACY);
  });

  describe("after merging the old record into the signed-in one", () => {
    beforeEach(async () => {
      await mergeUserAccounts({ sourceId: LEGACY, targetId: SESSION, dryRun: false });
    });

    test("the duplicate record is gone and the person appears once per workspace", async () => {
      expect(await prisma.user.count({ where: { id: LEGACY } })).toBe(0);
      const members = await prisma.teamMember.findMany({ where: { teamId: TEAM } });
      expect(members).toHaveLength(2);
      expect(members.map((member) => member.userId).sort()).toEqual([TEAMMATE, SESSION].sort());
    });

    test("every activity row now resolves to the account holding the photo", async () => {
      const rows = await prisma.teamActivity.findMany({
        where: { type: "task_completed" },
        include: { user: { select: { image: true } } },
      });
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.userId === SESSION)).toBe(true);
      expect(rows.every((row) => !!row.user?.image)).toBe(true);
    });

    test("the stronger workspace role and the longer streak survive", async () => {
      const membership = await prisma.teamMember.findFirstOrThrow({
        where: { teamId: TEAM, userId: SESSION },
      });
      expect(membership.role).toBe("owner");
      expect(membership.currentStreak).toBe(7);
    });

    test("the uploaded photo is kept and empty profile fields are filled in", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: SESSION } });
      expect(user.image).toBe("https://storage.example/users/session-frank/profile/avatar");
      expect(user.email).toBe("franklott@work.example");
      expect(user.isAdmin).toBe(true);
      expect(user.timezone).toBe("America/New_York");
      expect(user.personalBestStreak).toBe(9);
    });

    test("duplicate rows collapse instead of breaking unique constraints", async () => {
      expect(await prisma.messageReaction.count({ where: { messageId: MESSAGE } })).toBe(2);
      expect(await prisma.taskAssignment.count({ where: { taskId: TASK } })).toBe(1);
      expect(await prisma.joinRequest.count({ where: { teamId: TEAM } })).toBe(1);
      expect(await prisma.calendarConnection.count({ where: { userId: SESSION } })).toBe(2);
    });

    test("nothing that carried content is lost", async () => {
      const task = await prisma.task.findUniqueOrThrow({ where: { id: TASK } });
      expect(task.creatorId).toBe(SESSION);
      expect(await prisma.message.count({ where: { senderId: SESSION } })).toBe(1);
      expect(await prisma.directMessage.count({ where: { conversationId: DM_WITH_HISTORY } })).toBe(2);
    });

    test("the inbox keeps one thread per person and drops the empty leftovers", async () => {
      const conversations = await prisma.conversation.findMany({
        select: { id: true, dmPairKey: true, participants: { select: { userId: true } } },
      });
      expect(conversations.map((conversation) => conversation.id)).toEqual([DM_WITH_HISTORY]);

      const survivor = conversations[0]!;
      expect(survivor.participants.map((p) => p.userId).sort()).toEqual([TEAMMATE, SESSION].sort());
      // Repaired, otherwise opening the chat again would start a third thread.
      expect(survivor.dmPairKey).toBe(buildDmPairKey(TEAMMATE, SESSION));
    });

    test("sign-in rows follow the surviving account", async () => {
      expect(await prisma.session.count({ where: { userId: SESSION } })).toBe(2);
    });

    test("the pair no longer shows up as a duplicate", async () => {
      const candidates = await findDuplicateUserCandidates();
      expect(candidates).toEqual([]);
    });
  });
});

describe.skipIf(!enabled)("findDuplicateUserCandidates", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  test("groups the split records and shows which one is in use", async () => {
    const candidates = await findDuplicateUserCandidates();
    expect(candidates).toHaveLength(1);

    const [candidate] = candidates;
    expect(candidate!.key).toBe("frank lott");
    expect(candidate!.sharedTeamIds).toEqual([TEAM]);
    expect(candidate!.accounts.map((account) => account.id).sort()).toEqual(
      [LEGACY, SESSION].sort(),
    );

    const live = candidate!.accounts.find((account) => account.activeSessions > 0);
    expect(live?.id).toBe(SESSION);
    expect(live?.image).toBeTruthy();

    const older = candidate!.accounts.find((account) => account.id === LEGACY);
    expect(older?.counts.activities).toBe(2);
  });

  test("matches on name regardless of case or padding", async () => {
    await prisma.user.update({ where: { id: LEGACY }, data: { name: "  FRANK lott " } });
    const candidates = await findDuplicateUserCandidates();
    expect(candidates).toHaveLength(1);
  });

  test("ignores people who only have one record", async () => {
    await prisma.user.update({ where: { id: LEGACY }, data: { name: "Someone Else" } });
    const candidates = await findDuplicateUserCandidates();
    expect(candidates).toEqual([]);
  });
});
