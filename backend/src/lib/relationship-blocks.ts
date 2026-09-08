import { prisma } from "../prisma";
import {
  describeBidirectionalBlockStatus,
  findBlockedMentionIds,
  findNewlyIntroducedBlockedGroupPairs,
  type BidirectionalBlockStatus,
  type BlockRow,
} from "./block-policy";

const blockSelect = { blockerId: true, blockedId: true } as const;

export async function getBlockRowsBetween(
  userId: string,
  otherUserIds: readonly string[],
): Promise<BlockRow[]> {
  const unique = [...new Set(otherUserIds.filter((id) => id && id !== userId))];
  if (unique.length === 0) return [];
  return prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: unique } },
        { blockedId: userId, blockerId: { in: unique } },
      ],
    },
    select: blockSelect,
  });
}

export async function getBidirectionalBlockStatus(
  viewerId: string,
  otherUserId: string,
): Promise<BidirectionalBlockStatus> {
  const rows = await getBlockRowsBetween(viewerId, [otherUserId]);
  return describeBidirectionalBlockStatus(viewerId, otherUserId, rows);
}

export async function isBlockedEitherDirection(
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  const rows = await getBlockRowsBetween(userIdA, [userIdB]);
  return rows.length > 0;
}

export async function assertNoBlockedPairsInVoluntaryGroup(
  participantIds: readonly string[],
  newlyAddedUserIds: readonly string[] = participantIds,
): Promise<void> {
  const unique = [...new Set(participantIds.filter(Boolean))];
  if (unique.length < 2) return;
  const rows = await prisma.userBlock.findMany({
    where: {
      blockerId: { in: unique },
      blockedId: { in: unique },
    },
    select: blockSelect,
  });
  const newConflicts = findNewlyIntroducedBlockedGroupPairs(
    unique,
    newlyAddedUserIds,
    rows,
  );
  if (newConflicts.length > 0) {
    throw new Error("People who have blocked each other cannot be added to the same conversation.");
  }
}

export async function findBlockedDirectMentionIds(
  senderId: string,
  mentionedUserIds: readonly string[],
): Promise<string[]> {
  const rows = await getBlockRowsBetween(senderId, mentionedUserIds);
  return findBlockedMentionIds(senderId, mentionedUserIds, rows);
}
