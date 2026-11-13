import { describe, expect, test } from "bun:test";
import type { HomeInsightCard } from "@prisma/client";
import { toHomeInsightCardJson } from "./home-insight-serialize";

function card(partial: Partial<HomeInsightCard>): HomeInsightCard {
  return {
    id: "c1",
    slug: "coaching",
    title: "Title",
    body: "Body",
    actionLabel: "Go",
    accessibilityLabel: "Go label",
    imageUrl: "https://example.com/a.jpg",
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
    displayOrder: 0,
    isActive: true,
    updatedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...partial,
  };
}

describe("toHomeInsightCardJson", () => {
  test("maps seneca destination", () => {
    const json = toHomeInsightCardJson(card({}));
    expect(json.destination).toEqual({ type: "seneca", prompt: "Prompt" });
  });

  test("maps recognition destination", () => {
    const json = toHomeInsightCardJson(card({ destinationType: "recognition", senecaPrompt: "" }));
    expect(json.destination).toEqual({ type: "recognition" });
  });

  test("maps discover destination", () => {
    const json = toHomeInsightCardJson(
      card({
        destinationType: "discover",
        discoverArticleId: "a1",
        discoverSlug: "leading-well",
        senecaPrompt: "",
      }),
    );
    expect(json.destination).toEqual({
      type: "discover",
      articleId: "a1",
      slug: "leading-well",
    });
  });
});
