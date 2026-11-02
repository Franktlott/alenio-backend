export type NetworkConnectionRow = {
  requesterId: string;
  recipientId: string;
  status: string;
  updatedAt: Date;
};

export type NetworkBlockRow = {
  blockerId: string;
  blockedId: string;
};

export type NetworkAuthorCutoff = {
  authorId: string;
  visibleFrom: Date;
};

/** Current accepted, unblocked connections and the first post timestamp visible to a viewer. */
export function visibleNetworkAuthorCutoffs(
  viewerId: string,
  connections: readonly NetworkConnectionRow[],
  blocks: readonly NetworkBlockRow[],
): NetworkAuthorCutoff[] {
  const blockedIds = new Set(
    blocks.flatMap((row) =>
      row.blockerId === viewerId
        ? [row.blockedId]
        : row.blockedId === viewerId
          ? [row.blockerId]
          : [],
    ),
  );

  const cutoffs = new Map<string, Date>();
  for (const row of connections) {
    if (row.status !== "accepted") continue;
    const authorId =
      row.requesterId === viewerId
        ? row.recipientId
        : row.recipientId === viewerId
          ? row.requesterId
          : null;
    if (!authorId || blockedIds.has(authorId)) continue;

    const existing = cutoffs.get(authorId);
    if (!existing || row.updatedAt > existing) cutoffs.set(authorId, row.updatedAt);
  }

  return [...cutoffs].map(([authorId, visibleFrom]) => ({ authorId, visibleFrom }));
}

export function canAccessNetworkPost(
  viewerId: string,
  authorId: string | null,
  postCreatedAt: Date,
  authorCutoffs: readonly NetworkAuthorCutoff[],
): boolean {
  if (authorId === viewerId) return true;
  if (!authorId) return false;
  const cutoff = authorCutoffs.find((entry) => entry.authorId === authorId);
  return !!cutoff && postCreatedAt >= cutoff.visibleFrom;
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

