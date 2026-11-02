export type NetworkConnectionRow = {
  requesterId: string;
  recipientId: string;
  status: string;
};

export type NetworkBlockRow = {
  blockerId: string;
  blockedId: string;
};

/** Current accepted, unblocked connections whose network posts a viewer may access. */
export function visibleNetworkAuthorIds(
  viewerId: string,
  connections: readonly NetworkConnectionRow[],
  blocks: readonly NetworkBlockRow[],
): string[] {
  const blockedIds = new Set(
    blocks.flatMap((row) =>
      row.blockerId === viewerId
        ? [row.blockedId]
        : row.blockedId === viewerId
          ? [row.blockerId]
          : [],
    ),
  );

  return [
    ...new Set(
      connections.flatMap((row) => {
        if (row.status !== "accepted") return [];
        const otherId =
          row.requesterId === viewerId
            ? row.recipientId
            : row.recipientId === viewerId
              ? row.requesterId
              : null;
        return otherId && !blockedIds.has(otherId) ? [otherId] : [];
      }),
    ),
  ];
}

export function canAccessNetworkAuthor(
  viewerId: string,
  authorId: string | null,
  visibleAuthorIds: readonly string[],
): boolean {
  return authorId === viewerId || (!!authorId && visibleAuthorIds.includes(authorId));
}

export function isOwnedGenericUploadPath(userId: string, objectPath: string): boolean {
  return objectPath.startsWith(`users/${userId}/uploads/`);
}

/** Reactions are one rendered emoji/grapheme, not arbitrary short text. */
export function isValidReactionEmoji(value: string): boolean {
  const emoji = value.trim();
  if (!emoji || emoji.length > 24) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(emoji)];
  if (segments.length !== 1) return false;
  if (/[\p{Letter}\p{Number}\p{Control}]/u.test(emoji)) return false;
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(emoji);
}

