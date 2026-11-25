import { describe, expect, test } from "bun:test";
import type { HomeWorkspaceApiCard } from "./home-workspace-api";
import {
  nextWorkspacePromoIndex,
  previousWorkspacePromoIndex,
  resolveWorkspacePromoDeck,
  WORKSPACE_PROMO_ADVANCE_MS,
} from "./home-workspace-deck";

function card(
  id: string,
  overrides: Partial<HomeWorkspaceApiCard> = {},
): HomeWorkspaceApiCard {
  return {
    id,
    slug: id,
    title: `Card ${id}`,
    body: "Body",
    actionLabel: "Start",
    accessibilityLabel: `Card ${id}`,
    imageUrl: null,
    imageAlt: null,
    surfaceColor: "#140938",
    fadeColors: ["#140938", "#1A0B45", "transparent"],
    borderColor: "#140938",
    titleColor: "#FFFFFF",
    bodyColor: "#FFFFFF",
    buttonColors: ["#5B32D6", "#7C4DFF"],
    destination: { type: "create" },
    displayOrder: 0,
    isActive: true,
    updatedAt: "2026-11-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace promo deck", () => {
  test("keeps every active card and opens on the scheduled one", () => {
    const cards = [card("a"), card("b"), card("c"), card("d"), card("e")];
    const resolved = resolveWorkspacePromoDeck(cards, cards[2], 2);

    expect(resolved.deck.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(resolved.startIndex).toBe(2);
  });

  test("drops inactive cards and still finds the scheduled card", () => {
    const cards = [
      card("a"),
      card("hidden", { isActive: false, title: "Hidden" }),
      card("b"),
    ];
    const resolved = resolveWorkspacePromoDeck(cards, cards[2], 1);

    expect(resolved.deck.map((item) => item.id)).toEqual(["a", "b"]);
    expect(resolved.startIndex).toBe(1);
  });

  test("walks forward and wraps", () => {
    expect(nextWorkspacePromoIndex(0, 5)).toBe(1);
    expect(nextWorkspacePromoIndex(4, 5)).toBe(0);
    expect(previousWorkspacePromoIndex(0, 5)).toBe(4);
  });

  test("stays put when there is only one card", () => {
    expect(nextWorkspacePromoIndex(0, 1)).toBe(0);
    expect(previousWorkspacePromoIndex(0, 1)).toBe(0);
  });

  test("gives each card long enough to read", () => {
    expect(WORKSPACE_PROMO_ADVANCE_MS).toBe(8_000);
  });
});
