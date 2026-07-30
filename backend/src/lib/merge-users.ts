import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { buildDmPairKey } from "./dm-pair-key";

/**
 * Merging duplicate people records.
 *
 * A person can end up with two `User` rows when they sign in with a second identity whose
 * email differs from the row they already had (provider switch, invite created under a work
 * address, admin bootstrap, SCIM). `email` is unique, so the rows are never exact copies and
 * `syncAppUserFromAuth` cannot spot them. The visible symptom is a profile photo, streak, or
 * task history that only appears on some screens: whichever surface reads the record that
 * does not hold the data shows initials instead.
 */

const USER_MODEL = "User";

export type UserForeignKey = {
  model: string;
  /** Prisma client property, e.g. `teamMember`. */
  delegate: string;
  /** Scalar column holding the user id, e.g. `userId` or `createdById`. */
  column: string;
  required: boolean;
  /** Unique constraints containing `column`; rows that would collide get dropped, not moved. */
  uniques: string[][];
  idColumn: string | null;
};

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Every column in the schema that points at `User.id`, read from the generated datamodel so a
 * newly added relation is picked up without touching this file.
 */
export function collectUserForeignKeys(): UserForeignKey[] {
  const found: UserForeignKey[] = [];

  for (const model of Prisma.dmmf.datamodel.models) {
    const idColumn = model.fields.find((field) => field.isId)?.name ?? null;
    const uniques: string[][] = [
      ...model.uniqueFields.map((unique) => [...unique]),
      ...model.fields.filter((field) => field.isUnique).map((field) => [field.name]),
    ];

    for (const field of model.fields) {
      if (field.kind !== "object" || field.type !== USER_MODEL) continue;
      const from = field.relationFromFields ?? [];
      // Length 0 is the list side of the relation; composite keys are not used for User.
      if (from.length !== 1) continue;
      const column = from[0]!;

      found.push({
        model: model.name,
        delegate: delegateName(model.name),
        column,
        required: model.fields.find((f) => f.name === column)?.isRequired ?? false,
        uniques: uniques.filter((unique) => unique.includes(column)),
        idColumn,
      });
    }
  }

  return found.sort((a, b) => a.model.localeCompare(b.model) || a.column.localeCompare(b.column));
}

const TEAM_ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, leader: 2, member: 1 };

export function teamRoleRank(role: string | null | undefined): number {
  return TEAM_ROLE_RANK[(role ?? "").trim().toLowerCase()] ?? 0;
}

export type MergeableProfile = {
  name: string;
  image: string | null;
  isAdmin: boolean;
  emailVerified: boolean;
  pushToken: string | null;
  timezone: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  personalBestStreak: number;
};

/** Fills gaps on the surviving record from the one being merged away; never overwrites. */
export function mergeProfileFields(
  target: MergeableProfile,
  source: MergeableProfile,
): Partial<MergeableProfile> {
  const updates: Partial<MergeableProfile> = {};
  const filled = (value: string | null) => !!value?.trim();

  if (!filled(target.image) && filled(source.image)) updates.image = source.image;
  if (!filled(target.name) && filled(source.name)) updates.name = source.name;
  if (!filled(target.pushToken) && filled(source.pushToken)) updates.pushToken = source.pushToken;
  if (!filled(target.timezone) && filled(source.timezone)) updates.timezone = source.timezone;
  if (!filled(target.phoneNumber) && filled(source.phoneNumber)) {
    updates.phoneNumber = source.phoneNumber;
    updates.phoneNumberVerified = source.phoneNumberVerified;
  }
  if (!target.isAdmin && source.isAdmin) updates.isAdmin = true;
  if (!target.emailVerified && source.emailVerified) updates.emailVerified = true;
  if (source.personalBestStreak > target.personalBestStreak) {
    updates.personalBestStreak = source.personalBestStreak;
  }

  return updates;
}

export type ConversationCleanupInput = {
  id: string;
  isGroup: boolean;
  /** Distinct participant user ids after the merge. */
  participantIds: string[];
  messageCount: number;
  createdAt: Date | string;
};

/**
 * Two records for one person means the inbox can hold a thread to each of them, plus a thread
 * between the two (which becomes a chat with yourself). Empty leftovers are removed; anything
 * carrying history is kept so no message is ever lost.
 */
export function planConversationCleanup(
  mergedUserId: string,
  conversations: ConversationCleanupInput[],
): { deleteIds: string[] } {
  const deleteIds: string[] = [];
  const directByCounterpart = new Map<string, ConversationCleanupInput[]>();

  for (const conversation of conversations) {
    if (conversation.isGroup) continue;
    const others = [...new Set(conversation.participantIds)].filter((id) => id !== mergedUserId);

    if (others.length === 0) {
      if (conversation.messageCount === 0) deleteIds.push(conversation.id);
      continue;
    }
    if (others.length > 1) continue;

    const existing = directByCounterpart.get(others[0]!) ?? [];
    existing.push(conversation);
    directByCounterpart.set(others[0]!, existing);
  }

  for (const threads of directByCounterpart.values()) {
    if (threads.length < 2) continue;
    const ranked = [...threads].sort(
      (a, b) =>
        b.messageCount - a.messageCount ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (const thread of ranked.slice(1)) {
      if (thread.messageCount === 0) deleteIds.push(thread.id);
    }
  }

  return { deleteIds: [...new Set(deleteIds)] };
}

export type MergeTableReport = {
  model: string;
  column: string;
  moved: number;
  droppedConflicts: number;
};

export type MergeAccountSummary = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
  createdAt: Date;
};

export type MergeUsersReport = {
  dryRun: boolean;
  source: MergeAccountSummary;
  target: MergeAccountSummary;
  profileUpdates: Partial<MergeableProfile>;
  teamRoleUpgrades: Array<{ teamId: string; from: string; to: string }>;
  tables: MergeTableReport[];
  rowsMoved: number;
  rowsDropped: number;
  conversationsDeleted: number;
  dmPairKeysRepaired: number;
};

export class MergeUsersError extends Error {
  constructor(
    readonly code:
      | "SAME_USER"
      | "SOURCE_NOT_FOUND"
      | "TARGET_NOT_FOUND"
      | "SOURCE_HAS_ACTIVE_SESSION",
    message: string,
  ) {
    super(message);
    this.name = "MergeUsersError";
  }
}

class DryRunRollback extends Error {
  constructor(readonly report: MergeUsersReport) {
    super("merge dry run");
  }
}

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  isAdmin: true,
  createdAt: true,
  emailVerified: true,
  pushToken: true,
  timezone: true,
  phoneNumber: true,
  phoneNumberVerified: true,
  personalBestStreak: true,
} as const;

type LoadedAccount = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

function summarize(account: LoadedAccount): MergeAccountSummary {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    image: account.image,
    isAdmin: account.isAdmin,
    createdAt: account.createdAt,
  };
}

type Delegate = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

function tupleKey(row: Record<string, unknown>, columns: string[]): string {
  return JSON.stringify(columns.map((column) => row[column] ?? null));
}

/**
 * Moves one table's rows onto the surviving user. Rows that would break a unique constraint
 * (already a member of that team, already reacted with that emoji) are deleted rather than
 * moved, because the surviving record already expresses the same fact.
 */
async function repointTable(
  tx: Prisma.TransactionClient,
  fk: UserForeignKey,
  sourceId: string,
  targetId: string,
): Promise<MergeTableReport> {
  const delegate = (tx as unknown as Record<string, Delegate | undefined>)[fk.delegate];
  if (!delegate?.updateMany) {
    return { model: fk.model, column: fk.column, moved: 0, droppedConflicts: 0 };
  }

  let droppedConflicts = 0;

  for (const unique of fk.uniques) {
    const others = unique.filter((column) => column !== fk.column);

    if (others.length === 0) {
      // The user column is unique on its own, so at most one row may survive.
      const targetHasRow = await delegate.findMany({
        where: { [fk.column]: targetId },
        take: 1,
        select: fk.idColumn ? { [fk.idColumn]: true } : { [fk.column]: true },
      });
      if (targetHasRow.length === 0) continue;
      const removed = await delegate.deleteMany({ where: { [fk.column]: sourceId } });
      droppedConflicts += removed.count;
      continue;
    }

    const select = Object.fromEntries(others.map((column) => [column, true]));
    const targetRows = await delegate.findMany({ where: { [fk.column]: targetId }, select });
    if (targetRows.length === 0) continue;

    const taken = new Set(targetRows.map((row) => tupleKey(row, others)));
    const sourceRows = await delegate.findMany({
      where: { [fk.column]: sourceId },
      select: fk.idColumn ? { ...select, [fk.idColumn]: true } : select,
    });
    const conflicts = sourceRows.filter((row) => taken.has(tupleKey(row, others)));
    if (conflicts.length === 0) continue;

    if (fk.idColumn) {
      const ids = conflicts.map((row) => row[fk.idColumn!]);
      const removed = await delegate.deleteMany({ where: { [fk.idColumn]: { in: ids } } });
      droppedConflicts += removed.count;
    } else {
      for (const row of conflicts) {
        const where: Record<string, unknown> = { [fk.column]: sourceId };
        for (const column of others) where[column] = row[column];
        const removed = await delegate.deleteMany({ where });
        droppedConflicts += removed.count;
      }
    }
  }

  const moved = await delegate.updateMany({
    where: { [fk.column]: sourceId },
    data: { [fk.column]: targetId },
  });

  return { model: fk.model, column: fk.column, moved: moved.count, droppedConflicts };
}

/** Keeps the stronger workspace role and the longer streak when both records are members. */
async function reconcileTeamMemberships(
  tx: Prisma.TransactionClient,
  sourceId: string,
  targetId: string,
): Promise<Array<{ teamId: string; from: string; to: string }>> {
  const [sourceRows, targetRows] = await Promise.all([
    tx.teamMember.findMany({
      where: { userId: sourceId },
      select: { teamId: true, role: true, currentStreak: true },
    }),
    tx.teamMember.findMany({
      where: { userId: targetId },
      select: { id: true, teamId: true, role: true, currentStreak: true },
    }),
  ]);

  const sourceByTeam = new Map(sourceRows.map((row) => [row.teamId, row]));
  const upgrades: Array<{ teamId: string; from: string; to: string }> = [];

  for (const target of targetRows) {
    const source = sourceByTeam.get(target.teamId);
    if (!source) continue;

    const updates: { role?: string; currentStreak?: number } = {};
    if (teamRoleRank(source.role) > teamRoleRank(target.role)) {
      updates.role = source.role;
      upgrades.push({ teamId: target.teamId, from: target.role, to: source.role });
    }
    if (source.currentStreak > target.currentStreak) {
      updates.currentStreak = source.currentStreak;
    }
    if (Object.keys(updates).length > 0) {
      await tx.teamMember.update({ where: { id: target.id }, data: updates });
    }
  }

  return upgrades;
}

async function cleanUpConversations(
  tx: Prisma.TransactionClient,
  targetId: string,
): Promise<{ conversationsDeleted: number; dmPairKeysRepaired: number }> {
  const memberships = await tx.conversationParticipant.findMany({
    where: { userId: targetId },
    select: { conversationId: true },
  });
  const conversationIds = [...new Set(memberships.map((row) => row.conversationId))];
  if (conversationIds.length === 0) return { conversationsDeleted: 0, dmPairKeysRepaired: 0 };

  const conversations = await tx.conversation.findMany({
    where: { id: { in: conversationIds } },
    select: {
      id: true,
      isGroup: true,
      dmPairKey: true,
      createdAt: true,
      participants: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });

  const { deleteIds } = planConversationCleanup(
    targetId,
    conversations.map((conversation) => ({
      id: conversation.id,
      isGroup: conversation.isGroup,
      participantIds: conversation.participants.map((participant) => participant.userId),
      messageCount: conversation._count.messages,
      createdAt: conversation.createdAt,
    })),
  );

  let conversationsDeleted = 0;
  if (deleteIds.length > 0) {
    const removed = await tx.conversation.deleteMany({ where: { id: { in: deleteIds } } });
    conversationsDeleted = removed.count;
  }

  // A surviving thread may still carry a pair key built from the merged-away id, which would
  // make find-or-create open a third thread with the same person.
  let dmPairKeysRepaired = 0;
  for (const conversation of conversations) {
    if (conversation.isGroup || deleteIds.includes(conversation.id)) continue;
    const participantIds = [...new Set(conversation.participants.map((row) => row.userId))];
    if (participantIds.length !== 2) continue;

    const expected = buildDmPairKey(participantIds[0]!, participantIds[1]!);
    if (conversation.dmPairKey === expected) continue;

    const holder = await tx.conversation.findFirst({
      where: { dmPairKey: expected, id: { not: conversation.id } },
      select: { id: true },
    });
    if (holder) continue;

    await tx.conversation.update({ where: { id: conversation.id }, data: { dmPairKey: expected } });
    dmPairKeysRepaired += 1;
  }

  return { conversationsDeleted, dmPairKeysRepaired };
}

/**
 * Folds `sourceId` into `targetId` and deletes the duplicate record.
 *
 * Pass `dryRun` to get the same report without keeping any change: the work runs inside a
 * transaction that is rolled back, so the counts are measured rather than estimated.
 *
 * The target should be the record the person's current session binds to (the one `/api/me`
 * returns). Merging that record away would let the next request recreate it as a fresh
 * duplicate, so an active session on the source is refused unless `force` is set.
 */
export async function mergeUserAccounts(params: {
  sourceId: string;
  targetId: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<MergeUsersReport> {
  const { sourceId, targetId, dryRun = false, force = false } = params;

  if (sourceId === targetId) {
    throw new MergeUsersError("SAME_USER", "Pick two different accounts to merge.");
  }

  const [source, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: sourceId }, select: ACCOUNT_SELECT }),
    prisma.user.findUnique({ where: { id: targetId }, select: ACCOUNT_SELECT }),
  ]);
  if (!source) throw new MergeUsersError("SOURCE_NOT_FOUND", `No account with id ${sourceId}.`);
  if (!target) throw new MergeUsersError("TARGET_NOT_FOUND", `No account with id ${targetId}.`);

  if (!force) {
    const activeSessions = await prisma.session.count({
      where: { userId: sourceId, expiresAt: { gt: new Date() } },
    });
    if (activeSessions > 0) {
      throw new MergeUsersError(
        "SOURCE_HAS_ACTIVE_SESSION",
        `${source.email} has ${activeSessions} active session(s), so it is probably the account being used right now. Merge in the other direction, or set force to override.`,
      );
    }
  }

  const foreignKeys = collectUserForeignKeys();

  const run = async (tx: Prisma.TransactionClient): Promise<MergeUsersReport> => {
    const profileUpdates = mergeProfileFields(target, source);
    if (Object.keys(profileUpdates).length > 0) {
      await tx.user.update({ where: { id: targetId }, data: profileUpdates });
    }

    const teamRoleUpgrades = await reconcileTeamMemberships(tx, sourceId, targetId);

    const tables: MergeTableReport[] = [];
    for (const fk of foreignKeys) {
      tables.push(await repointTable(tx, fk, sourceId, targetId));
    }

    const { conversationsDeleted, dmPairKeysRepaired } = await cleanUpConversations(tx, targetId);

    await tx.user.delete({ where: { id: sourceId } });

    return {
      dryRun,
      source: summarize(source),
      target: summarize(target),
      profileUpdates,
      teamRoleUpgrades,
      tables: tables.filter((table) => table.moved > 0 || table.droppedConflicts > 0),
      rowsMoved: tables.reduce((total, table) => total + table.moved, 0),
      rowsDropped: tables.reduce((total, table) => total + table.droppedConflicts, 0),
      conversationsDeleted,
      dmPairKeysRepaired,
    };
  };

  try {
    return await prisma.$transaction(
      async (tx) => {
        const report = await run(tx);
        if (dryRun) throw new DryRunRollback(report);
        return report;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  } catch (err) {
    if (err instanceof DryRunRollback) return err.report;
    throw err;
  }
}

export type DuplicateCandidate = {
  key: string;
  accounts: Array<{
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
    createdAt: Date;
    activeSessions: number;
    counts: {
      teams: number;
      activities: number;
      teamMessages: number;
      directMessages: number;
      taskAssignments: number;
      tasksCreated: number;
    };
    teams: Array<{ teamId: string; teamName: string; role: string }>;
  }>;
  sharedTeamIds: string[];
};

/**
 * Groups accounts that share a display name. Duplicates of one person always differ by email
 * (it is unique), so the name plus an overlapping workspace is the signal worth surfacing.
 */
export async function findDuplicateUserCandidates(limit = 25): Promise<DuplicateCandidate[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; key: string }>>`
    SELECT id, lower(btrim(name)) AS key
    FROM "User"
    WHERE btrim(name) <> ''
      AND lower(btrim(name)) IN (
        SELECT lower(btrim(name))
        FROM "User"
        WHERE btrim(name) <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
      )
  `;
  if (rows.length === 0) return [];

  const idsByKey = new Map<string, string[]>();
  for (const row of rows) {
    idsByKey.set(row.key, [...(idsByKey.get(row.key) ?? []), row.id]);
  }

  const keys = [...idsByKey.keys()].slice(0, limit);
  const ids = keys.flatMap((key) => idsByKey.get(key) ?? []);

  const [accounts, sessions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAdmin: true,
        createdAt: true,
        teamMembers: {
          select: { teamId: true, role: true, team: { select: { name: true } } },
        },
        _count: {
          select: {
            teamMembers: true,
            activities: true,
            messagesSent: true,
            directMessages: true,
            assignments: true,
            tasksCreated: true,
          },
        },
      },
    }),
    prisma.session.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, expiresAt: { gt: new Date() } },
      _count: { _all: true },
    }),
  ]);

  const activeByUser = new Map(sessions.map((row) => [row.userId, row._count._all]));
  const byId = new Map(accounts.map((account) => [account.id, account]));

  return keys
    .map((key) => {
      const group = (idsByKey.get(key) ?? [])
        .map((id) => byId.get(id))
        .filter((account): account is (typeof accounts)[number] => !!account);

      const teamCounts = new Map<string, number>();
      for (const account of group) {
        for (const teamId of new Set(account.teamMembers.map((row) => row.teamId))) {
          teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
        }
      }

      return {
        key,
        sharedTeamIds: [...teamCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([teamId]) => teamId),
        accounts: group.map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          image: account.image,
          isAdmin: account.isAdmin,
          createdAt: account.createdAt,
          activeSessions: activeByUser.get(account.id) ?? 0,
          counts: {
            teams: account._count.teamMembers,
            activities: account._count.activities,
            teamMessages: account._count.messagesSent,
            directMessages: account._count.directMessages,
            taskAssignments: account._count.assignments,
            tasksCreated: account._count.tasksCreated,
          },
          teams: account.teamMembers.map((row) => ({
            teamId: row.teamId,
            teamName: row.team.name,
            role: row.role,
          })),
        })),
      };
    })
    .filter((candidate) => candidate.accounts.length > 1);
}
