import { describe, expect, test } from "bun:test";
import { articlesForHome } from "./discover-selection";
import type { DiscoverArticleSummary } from "./discover";

function article(slug: string): DiscoverArticleSummary {
  return {
    id: slug,
    title: slug,
    slug,
    excerpt: "",
    category: null,
    coverImageUrl: null,
    coverImageAlt: null,
    readingTimeMinutes: 1,
    isFeatured: false,
    featuredInCategory: false,
    displayOrder: 0,
    publishedAt: null,
    updatedAt: "",
  };
}

describe("home discover selection", () => {
  test("uses featured articles when any are marked", () => {
    expect(articlesForHome([article("featured")], [article("recent")]).map((item) => item.slug)).toEqual([
      "featured",
    ]);
  });

  test("falls back to the newest article when nothing is featured", () => {
    expect(articlesForHome([], [article("one"), article("two")]).map((item) => item.slug)).toEqual([
      "one",
    ]);
  });

  test("can still return more than one when a higher limit is passed", () => {
    expect(
      articlesForHome([], [article("one"), article("two")], 2).map((item) => item.slug),
    ).toEqual(["one", "two"]);
  });
});
