import type { HomeWorkspaceApiCard } from "@/lib/home-workspace-api";

/** How long each workspace promo card stays before the next one. */
export const WORKSPACE_PROMO_ADVANCE_MS = 8_000;

export function activeWorkspacePromoCards(
  cards: readonly HomeWorkspaceApiCard[] | undefined,
): HomeWorkspaceApiCard[] {
  return (cards ?? []).filter(
    (card) => card.isActive && card.title.trim().length > 0,
  );
}

/**
 * The scheduled card is where the dots open. Matching its id keeps the pager
 * aligned when inactive cards sit in the full list.
 */
export function workspacePromoStartIndex(
  deck: readonly { id: string }[],
  current: { id: string } | null | undefined,
  currentIndex: number | null | undefined,
): number {
  if (deck.length === 0) return 0;
  if (current) {
    const found = deck.findIndex((card) => card.id === current.id);
    if (found >= 0) return found;
  }
  if (
    typeof currentIndex === "number" &&
    currentIndex >= 0 &&
    currentIndex < deck.length
  ) {
    return currentIndex;
  }
  return 0;
}

export function resolveWorkspacePromoDeck(
  cards: readonly HomeWorkspaceApiCard[] | undefined,
  current: HomeWorkspaceApiCard | null | undefined,
  currentIndex: number | null | undefined,
): { deck: HomeWorkspaceApiCard[]; startIndex: number } {
  const active = activeWorkspacePromoCards(cards);
  const fallback =
    active.length === 0 && current && current.title.trim().length > 0
      ? [current]
      : active;
  return {
    deck: fallback,
    startIndex: workspacePromoStartIndex(fallback, current, currentIndex),
  };
}

export function nextWorkspacePromoIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((safe % count) + count + 1) % count;
}

export function previousWorkspacePromoIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((safe % count) + count - 1) % count;
}
