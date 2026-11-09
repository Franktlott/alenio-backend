/**
 * The reactions a feed post can carry, in tray order. Each one owns a name and
 * an accent so the action button can wear the reaction a person picked, the way
 * Facebook swaps Like for Love.
 */
export type FeedReaction = {
  emoji: string;
  label: string;
  color: string;
};

export const FEED_REACTIONS: readonly FeedReaction[] = [
  { emoji: "😊", label: "Nice", color: "#E8A33D" },
  { emoji: "❤️", label: "Love", color: "#F02849" },
  { emoji: "😂", label: "Haha", color: "#E8A33D" },
  { emoji: "😮", label: "Wow", color: "#E8A33D" },
  { emoji: "🔥", label: "Fire", color: "#EF6C1A" },
  { emoji: "🎉", label: "Celebrate", color: "#7B61FF" },
] as const;

/** The default a plain tap leaves, matching the heart on the action row. */
export const DEFAULT_FEED_REACTION = "❤️";

export function feedReaction(emoji: string | null | undefined) {
  if (!emoji) return null;
  return FEED_REACTIONS.find((reaction) => reaction.emoji === emoji) ?? null;
}

/** Unknown emoji still deserve a readable button, so fall back to the glyph. */
export function feedReactionLabel(emoji: string | null | undefined): string {
  return feedReaction(emoji)?.label ?? "Reacted";
}
