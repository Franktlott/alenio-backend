import { describe, expect, test } from "bun:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  applyMomentumCompletion,
  eligibleMomentumUserIds,
  revokeMomentumCompletion,
  withSerializableMomentumTransaction,
} from "./momentum-service";

const dueAt = new Date("2026-08-27T23:59:59.000Z");

describe("Momentum credit eligibility", () => {
  test("standard tasks only credit the assigned completing actor", () => {
    expect(
      eligibleMomentumUserIds({
        dueAt,
        actorUserId: "assigned",
        isJoint: false,
        assignedUserIds: ["assigned", "other"],
        subtaskCompletionUserIds: [],
      }),
    ).toEqual(["assigned"]);

    expect(
      eligibleMomentumUserIds({
        dueAt,
        actorUserId: "creator-not-assigned",
        isJoint: false,
        assignedUserIds: ["assigned"],
        subtaskCompletionUserIds: [],
      }),
    ).toEqual([]);
  });

  test("tasks without due dates never earn credit", () => {
    expect(
      eligibleMomentumUserIds({
        dueAt: null,
        actorUserId: "member",
        isJoint: false,
        assignedUserIds: ["member"],
        subtaskCompletionUserIds: [],
      }),
    ).toEqual([]);
  });

  test("joint tasks credit assignees who completed any subtask", () => {
    expect(
      eligibleMomentumUserIds({
        dueAt,
        actorUserId: "a",
        isJoint: true,
        assignedUserIds: ["a", "b", "c"],
        subtaskCompletionUserIds: [
          ["a"],
          ["b"],
        ],
      }),
    ).toEqual(["a", "b"]);
  });

  test("joint tasks without subtasks credit only the assigned completing actor", () => {
    expect(
      eligibleMomentumUserIds({
        dueAt,
        actorUserId: "a",
        isJoint: true,
        assignedUserIds: ["a", "b"],
        subtaskCompletionUserIds: [],
      }),
    ).toEqual(["a"]);
  });

  test("joint tasks credit the closer even if a teammate finished the subtasks", () => {
    expect(
      eligibleMomentumUserIds({
        dueAt,
        actorUserId: "a",
        isJoint: true,
        assignedUserIds: ["a", "b"],
        subtaskCompletionUserIds: [["b"], ["b"]],
      }),
    ).toEqual(["a", "b"]);
  });
});

type TestTask = {
  id: string;
  teamId: string;
  title: string;
  incognito: boolean;
  isJoint: boolean;
  dueDate: Date | null;
  kind: string;
  momentumEligible: boolean;
  assignments: Array<{ userId: string }>;
  subtasks: Array<{ completions: Array<{ userId: string }> }>;
};

type TestCredit = {
  id: string;
  teamId: string;
  sourceTaskId: string;
  creditedUserId: string;
  creditedTeamMemberId: string | undefined;
  sourceTaskTitle: string | null;
  sourceTaskIncognito: boolean;
  dueAt: Date;
  completedAt: Date;
  onTime: boolean;
  revokedAt: Date | null;
  revocationReason: string | null;
};

type TestMember = {
  id: string;
  teamId: string;
  userId: string;
  currentStreak: number;
  personalBestStreak: number;
  personalBestCelebrated: boolean;
  momentumRunStartedAt: Date | null;
  momentumLastQualifiedAt: Date | null;
};

function matchesCredit(
  credit: TestCredit,
  where: Record<string, any> | undefined,
): boolean {
  if (!where) return true;
  if (where.id?.in && !where.id.in.includes(credit.id)) return false;
  if (where.teamId !== undefined && credit.teamId !== where.teamId) return false;
  if (where.sourceTaskId !== undefined && credit.sourceTaskId !== where.sourceTaskId) return false;
  if (where.creditedUserId?.in && !where.creditedUserId.in.includes(credit.creditedUserId)) {
    return false;
  }
  if (
    typeof where.creditedUserId === "string" &&
    credit.creditedUserId !== where.creditedUserId
  ) {
    return false;
  }
  if (where.revokedAt === null && credit.revokedAt !== null) return false;
  return true;
}

function momentumDb(input?: {
  tasks?: TestTask[];
  members?: TestMember[];
  credits?: TestCredit[];
}) {
  const tasks = input?.tasks ?? [];
  const members = input?.members ?? [];
  const credits = input?.credits ?? [];
  let nextCredit = credits.length + 1;
  const db = {
    task: {
      findUnique: async ({ where }: any) =>
        tasks.find((task) => task.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const task = data as TestTask;
        tasks.push(task);
        return task;
      },
    },
    momentumCompletionCredit: {
      findMany: async ({ where }: any) =>
        credits.filter((credit) => matchesCredit(credit, where)),
      upsert: async ({ where, create, update }: any) => {
        const key = where.teamId_sourceTaskId_creditedUserId;
        let credit = credits.find(
          (item) =>
            item.teamId === key.teamId &&
            item.sourceTaskId === key.sourceTaskId &&
            item.creditedUserId === key.creditedUserId,
        );
        if (credit) Object.assign(credit, update);
        else {
          const createdCredit: TestCredit = {
            id: `credit-${nextCredit++}`,
            revokedAt: null,
            revocationReason: null,
            ...create,
          };
          credits.push(createdCredit);
          credit = createdCredit;
        }
        return { id: credit.id };
      },
      updateMany: async ({ where, data }: any) => {
        const matching = credits.filter((credit) => matchesCredit(credit, where));
        matching.forEach((credit) => Object.assign(credit, data));
        return { count: matching.length };
      },
    },
    teamMember: {
      findMany: async ({ where }: any) =>
        members.filter(
          (member) =>
            member.teamId === where.teamId &&
            (!where.userId?.in || where.userId.in.includes(member.userId)),
        ),
      update: async ({ where, data }: any) => {
        const key = where.userId_teamId;
        const member = members.find(
          (item) => item.userId === key.userId && item.teamId === key.teamId,
        );
        if (!member) throw new Error("Missing test member");
        Object.assign(member, data);
        return member;
      },
    },
  };
  return { db: db as any, tasks, members, credits };
}

function task(
  id: string,
  dueDate: Date,
  overrides: Partial<TestTask> = {},
): TestTask {
  return {
    id,
    teamId: "team-1",
    title: id,
    incognito: false,
    isJoint: false,
    dueDate,
    kind: "workspace_task",
    momentumEligible: true,
    assignments: [{ userId: "user-1" }],
    subtasks: [],
    ...overrides,
  };
}

function member(overrides: Partial<TestMember> = {}): TestMember {
  return {
    id: "member-1",
    teamId: "team-1",
    userId: "user-1",
    currentStreak: 0,
    personalBestStreak: 0,
    personalBestCelebrated: false,
    momentumRunStartedAt: null,
    momentumLastQualifiedAt: null,
    ...overrides,
  };
}

describe("Momentum service lifecycle", () => {
  test.each([
    { kind: "reminder", momentumEligible: false },
    { kind: "workspace_task", momentumEligible: false },
  ])("does not create or revoke credit for $kind with eligibility $momentumEligible", async (classification) => {
    const existingCredit: TestCredit = {
      id: "legacy-credit",
      teamId: "team-1",
      sourceTaskId: "ineligible",
      creditedUserId: "user-1",
      creditedTeamMemberId: "member-1",
      sourceTaskTitle: "Existing evidence",
      sourceTaskIncognito: false,
      dueAt,
      completedAt: dueAt,
      onTime: true,
      revokedAt: null,
      revocationReason: null,
    };
    const store = momentumDb({
      tasks: [task("ineligible", dueAt, classification)],
      members: [member()],
      credits: [existingCredit],
    });

    expect(
      await applyMomentumCompletion(store.db, {
        taskId: "ineligible",
        actorUserId: "user-1",
        completedAt: dueAt,
      }),
    ).toMatchObject({ creditedUserIds: [], creditIds: [] });
    expect(
      await revokeMomentumCompletion(store.db, {
        taskId: "ineligible",
        revokedAt: new Date("2026-08-28T00:00:00.000Z"),
      }),
    ).toMatchObject({ creditedUserIds: [], creditIds: [] });
    expect(existingCredit.revokedAt).toBeNull();
  });

  test("creates durable evidence atomically with a create-as-done task", async () => {
    const dueDate = new Date("2026-08-28T12:00:00.000Z");
    const completedAt = new Date("2026-08-27T12:00:00.000Z");
    const store = momentumDb({ members: [member()] });
    let transactions = 0;
    const client = {
      $transaction: async (operation: (tx: any) => Promise<unknown>) => {
        transactions += 1;
        return operation(store.db);
      },
    } as unknown as PrismaClient;

    const result = await withSerializableMomentumTransaction(client, async (tx) => {
      const created = await (tx as any).task.create({
        data: task("created-done", dueDate),
      });
      const momentum = await applyMomentumCompletion(tx, {
        taskId: created.id,
        actorUserId: "user-1",
        completedAt,
      });
      return { created, momentum };
    });

    expect(transactions).toBe(1);
    expect(result.momentum.creditedUserIds).toEqual(["user-1"]);
    expect(store.tasks).toHaveLength(1);
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]).toMatchObject({
      sourceTaskId: "created-done",
      completedAt,
      onTime: true,
      revokedAt: null,
    });
    expect(store.members[0]).toMatchObject({
      currentStreak: 1,
      personalBestStreak: 1,
    });
  });

  test("recall revokes and reprojects, then re-completion reuses the evidence row", async () => {
    const firstCompletedAt = new Date("2026-08-20T12:00:00.000Z");
    const recalledAt = new Date("2026-08-21T12:00:00.000Z");
    const recompletedAt = new Date("2026-08-22T14:00:00.000Z");
    const store = momentumDb({
      tasks: [task("task-1", new Date("2026-08-22T13:00:00.000Z"))],
      members: [member()],
    });

    const first = await applyMomentumCompletion(store.db, {
      taskId: "task-1",
      actorUserId: "user-1",
      completedAt: firstCompletedAt,
    });
    const recalled = await revokeMomentumCompletion(store.db, {
      taskId: "task-1",
      revokedAt: recalledAt,
    });
    const recompleted = await applyMomentumCompletion(store.db, {
      taskId: "task-1",
      actorUserId: "user-1",
      completedAt: recompletedAt,
    });

    expect(recalled.creditIds).toEqual(first.creditIds);
    expect(store.members[0]?.currentStreak).toBe(0);
    expect(recompleted.creditIds).toEqual(first.creditIds);
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]).toMatchObject({
      completedAt: recompletedAt,
      onTime: false,
      revokedAt: null,
      revocationReason: null,
    });
    expect(store.members[0]).toMatchObject({
      currentStreak: 0,
      personalBestStreak: 0,
    });
  });

  test("re-applying an active completion is idempotent", async () => {
    const completedAt = new Date("2026-08-20T12:00:00.000Z");
    const store = momentumDb({
      tasks: [task("task-1", new Date("2026-08-21T12:00:00.000Z"))],
      members: [member()],
    });

    const first = await applyMomentumCompletion(store.db, {
      taskId: "task-1",
      actorUserId: "user-1",
      completedAt,
    });
    const second = await applyMomentumCompletion(store.db, {
      taskId: "task-1",
      actorUserId: "user-1",
      completedAt: new Date("2026-08-20T18:00:00.000Z"),
    });

    expect(second.creditIds).toEqual(first.creditIds);
    expect(second.milestoneCount).toBeNull();
    expect(second.personalBestCount).toBeNull();
    expect(store.credits).toHaveLength(1);
    expect(store.credits[0]?.completedAt).toEqual(completedAt);
    expect(store.members[0]).toMatchObject({
      currentStreak: 1,
      personalBestStreak: 1,
    });
  });

  test("first best and ties are quiet, while a post-break new best celebrates once", async () => {
    const store = momentumDb({
      tasks: [
        task("first", new Date("2026-08-02T13:00:00.000Z")),
        task("break", new Date("2026-08-03T11:00:00.000Z")),
        task("tie", new Date("2026-08-04T13:00:00.000Z")),
        task("new-best", new Date("2026-08-05T13:00:00.000Z")),
      ],
      members: [member()],
    });
    const complete = (taskId: string, completedAt: string) =>
      applyMomentumCompletion(store.db, {
        taskId,
        actorUserId: "user-1",
        completedAt: new Date(completedAt),
      });

    expect((await complete("first", "2026-08-02T12:00:00.000Z")).personalBestCount).toBeNull();
    expect((await complete("break", "2026-08-03T12:00:00.000Z")).personalBestCount).toBeNull();
    expect((await complete("tie", "2026-08-04T12:00:00.000Z")).personalBestCount).toBeNull();
    expect((await complete("new-best", "2026-08-05T12:00:00.000Z")).personalBestCount).toBe(2);
    expect(store.members[0]).toMatchObject({
      currentStreak: 2,
      personalBestStreak: 2,
      personalBestCelebrated: true,
    });
  });
});

describe("serializable Momentum transaction", () => {
  test("retries P2034 conflicts and preserves Serializable isolation", async () => {
    let attempts = 0;
    const isolationLevels: unknown[] = [];
    const client = {
      $transaction: async (
        operation: (tx: any) => Promise<string>,
        options: { isolationLevel: unknown },
      ) => {
        attempts += 1;
        isolationLevels.push(options.isolationLevel);
        if (attempts < 3) {
          throw new Prisma.PrismaClientKnownRequestError("write conflict", {
            code: "P2034",
            clientVersion: "6.0.0",
          });
        }
        return operation({ attempt: attempts });
      },
    } as unknown as PrismaClient;

    await expect(
      withSerializableMomentumTransaction(client, async (tx) =>
        String((tx as any).attempt),
      ),
    ).resolves.toBe("3");
    expect(attempts).toBe(3);
    expect(isolationLevels).toEqual([
      Prisma.TransactionIsolationLevel.Serializable,
      Prisma.TransactionIsolationLevel.Serializable,
      Prisma.TransactionIsolationLevel.Serializable,
    ]);
  });

  test("does not retry non-conflict failures", async () => {
    let attempts = 0;
    const failure = new Error("validation failed");
    const client = {
      $transaction: async () => {
        attempts += 1;
        throw failure;
      },
    } as unknown as PrismaClient;

    await expect(
      withSerializableMomentumTransaction(client, async () => "never"),
    ).rejects.toBe(failure);
    expect(attempts).toBe(1);
  });
});
