import { describe, expect, test } from "bun:test";
import type { HomeInsightCard, HomeInsightSettings } from "@prisma/client";
import { resolveHomeInsightDeck, utcMondayStart } from "./home-insight-schedule";

function card(partial: Partial<HomeInsightCard> & { id: string; slug: string; displayOrder: number }): HomeInsightCard {
  return {
    title: partial.title ?? partial.slug,
    body: "Body",
    actionLabel: "Go",
    accessibilityLabel: "Go",
    imageUrl: null,
    imageAlt: null,
    surfaceColor: "#fff",
    fadeColors: ["#fff", "#eee", "transparent"],
    borderColor: "#ddd",
    titleColor: "#111",
    bodyColor: "#666",
    buttonColors: ["#5B32D6", "#7C4DFF"],
    destinationType: "seneca",
    senecaPrompt: "Prompt",
    discoverArticleId: null,
    discoverSlug: null,
    isActive: true,
    updatedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...partial,
  };
}

function settings(partial: Partial<HomeInsightSettings> = {}): HomeInsightSettings {
  return {
    id: "default",
    mode: "automatic",
    cadence: "weekly",
    pinnedCardId: null,
    epochAt: new Date(Date.UTC(2026, 7, 24)),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedById: null,
    ...partial,
  };
}

const deck = [
  card({ id: "a", slug: "a", displayOrder: 0 }),
  card({ id: "b", slug: "b", displayOrder: 1 }),
  card({ id: "c", slug: "c", displayOrder: 2 }),
];

describe("resolveHomeInsightDeck", () => {
  test("automatic weekly uses Monday buckets from epoch", () => {
    const monday = new Date("2026-08-24T12:00:00.000Z");
    const resolved = resolveHomeInsightDeck(deck, settings(), monday);
    expect(resolved.current?.id).toBe("a");
    expect(resolved.nextCard?.id).toBe("b");
    expect(resolved.nextChangeAt).toBe(new Date(utcMondayStart(monday) + 7 * 24 * 60 * 60 * 1000).toISOString());
  });

  test("automatic daily advances each UTC day", () => {
    const day0 = new Date("2026-08-24T15:00:00.000Z");
    const day1 = new Date("2026-08-25T01:00:00.000Z");
    expect(resolveHomeInsightDeck(deck, settings({ cadence: "daily" }), day0).current?.id).toBe("a");
    expect(resolveHomeInsightDeck(deck, settings({ cadence: "daily" }), day1).current?.id).toBe("b");
  });

  test("manual pins a specific active card with no next change", () => {
    const resolved = resolveHomeInsightDeck(
      deck,
      settings({ mode: "manual", pinnedCardId: "c" }),
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(resolved.current?.id).toBe("c");
    expect(resolved.nextChangeAt).toBeNull();
    expect(resolved.nextCard).toBeNull();
  });

  test("ignores inactive cards in automatic rotation", () => {
    const mixed = [
      card({ id: "a", slug: "a", displayOrder: 0, isActive: false }),
      card({ id: "b", slug: "b", displayOrder: 1 }),
      card({ id: "c", slug: "c", displayOrder: 2 }),
    ];
    const resolved = resolveHomeInsightDeck(mixed, settings(), new Date("2026-08-24T12:00:00.000Z"));
    expect(resolved.current?.id).toBe("b");
  });
});
