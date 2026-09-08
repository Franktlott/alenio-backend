export type BlockRow = {
  blockerId: string;
  blockedId: string;
};

export type BidirectionalBlockStatus = {
  blockedByMe: boolean;
  blockedByThem: boolean;
  status: "blocked_by_me" | "blocked_by_them" | "blocked_both" | null;
};

export function describeBidirectionalBlockStatus(
  viewerId: string,
  otherUserId: string,
  rows: readonly BlockRow[],
): BidirectionalBlockStatus {
  const blockedByMe = rows.some(
    (row) => row.blockerId === viewerId && row.blockedId === otherUserId,
  );
  const blockedByThem = rows.some(
    (row) => row.blockerId === otherUserId && row.blockedId === viewerId,
  );

  return {
    blockedByMe,
    blockedByThem,
    status:
      blockedByMe && blockedByThem
        ? "blocked_both"
        : blockedByMe
          ? "blocked_by_me"
          : blockedByThem
            ? "blocked_by_them"
            : null,
  };
}

export function findBlockedGroupPairs(
  participantIds: readonly string[],
  rows: readonly BlockRow[],
): BlockRow[] {
  const participants = new Set(participantIds);
  return rows.filter(
    (row) =>
      row.blockerId !== row.blockedId &&
      participants.has(row.blockerId) &&
      participants.has(row.blockedId),
  );
}

export function findNewlyIntroducedBlockedGroupPairs(
  participantIds: readonly string[],
  newlyAddedUserIds: readonly string[],
  rows: readonly BlockRow[],
): BlockRow[] {
  const newlyAdded = new Set(newlyAddedUserIds);
  return findBlockedGroupPairs(participantIds, rows).filter(
    (row) => newlyAdded.has(row.blockerId) || newlyAdded.has(row.blockedId),
  );
}

export function findBlockedMentionIds(
  senderId: string,
  mentionedUserIds: readonly string[],
  rows: readonly BlockRow[],
): string[] {
  const mentioned = new Set(mentionedUserIds.filter((id) => id !== senderId));
  const blocked = new Set<string>();
  for (const row of rows) {
    if (row.blockerId === senderId && mentioned.has(row.blockedId)) blocked.add(row.blockedId);
    if (row.blockedId === senderId && mentioned.has(row.blockerId)) blocked.add(row.blockerId);
  }
  return [...blocked];
}
