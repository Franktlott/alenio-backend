import { describe, expect, test } from "bun:test";
import {
  readingTimeMinutes,
  sanitizeDiscoverDoc,
  slugifyDiscoverTitle,
} from "./discover-document";
import { toPublicDetail, toPublicSummary } from "./discover-serialize";
import { discoverArticleIsLive, resolvePublication } from "./discover-visibility";

const now = new Date("2026-11-05T18:00:00.000Z");

describe("discover visibility", () => {
  test("hides drafts, archived rows, and future scheduled rows", () => {
    expect(discoverArticleIsLive({ status: "draft", publishedAt: now, scheduledAt: null }, now)).toBe(false);
    expect(discoverArticleIsLive({ status: "archived", publishedAt: now, scheduledAt: null }, now)).toBe(false);
    expect(
      discoverArticleIsLive(
        { status: "scheduled", publishedAt: null, scheduledAt: new Date("2026-11-05T19:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });

  test("shows published and due scheduled rows", () => {
    expect(
      discoverArticleIsLive(
        { status: "published", publishedAt: new Date("2026-11-05T17:00:00.000Z"), scheduledAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      discoverArticleIsLive(
        { status: "scheduled", publishedAt: null, scheduledAt: new Date("2026-11-05T18:00:00.000Z") },
        now,
      ),
    ).toBe(true);
    expect(discoverArticleIsLive({ status: "published", publishedAt: null, scheduledAt: null }, now)).toBe(false);
  });

  test("a future publish time is stored as scheduled", () => {
    const result = resolvePublication(
      { status: "published", publishedAt: "2026-11-06T12:00:00.000Z" },
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("scheduled");
      expect(result.scheduledAt?.toISOString()).toBe("2026-11-06T12:00:00.000Z");
    }
  });

  test("public serializer drops anything that is not live", () => {
    const draft = {
      id: "a",
      title: "Draft",
      slug: "draft",
      excerpt: "",
      content: { type: "doc", content: [] },
      categoryId: null,
      category: null,
      coverImageUrl: null,
      coverImageAlt: null,
      status: "draft",
      isFeatured: false,
      featuredInCategory: false,
      displayOrder: 0,
      readingTimeMinutes: 0,
      senecaEnabled: false,
      senecaPrompt: "secret",
      senecaContext: "secret",
      publishedAt: null,
      scheduledAt: null,
      viewCount: 3,
      createdById: null,
      updatedById: null,
      lastPublishedAt: null,
      authorName: "",
      pendingDraft: null,
      pendingDraftAt: null,
      pendingDraftById: null,
      lastPublishedById: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(toPublicSummary(draft, now)).toBeNull();
    expect(toPublicDetail(draft, now)).toBeNull();
  });
});

describe("discover document", () => {
  test("drops unknown nodes, scripts, and non-https links", () => {
    const doc = sanitizeDiscoverDoc({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Keep" }] },
        { type: "codeBlock", content: [{ type: "text", text: "drop" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
        },
        { type: "image", attrs: { src: "http://example.com/a.png", alt: "no" } },
        { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "yes" } },
      ],
    });
    expect(doc.content.map((block) => block.type)).toEqual(["paragraph", "paragraph", "image"]);
    const link = doc.content[1];
    expect(link?.type).toBe("paragraph");
    if (link?.type === "paragraph") expect(link.content?.[0]).toEqual({ type: "text", text: "bad" });
  });

  test("counts reading time from visible words", () => {
    const words = Array.from({ length: 200 }, () => "word").join(" ");
    const doc = sanitizeDiscoverDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: words }] }],
    });
    expect(readingTimeMinutes(doc)).toBe(1);
    expect(slugifyDiscoverTitle("A Better Way!")).toBe("a-better-way");
  });
});
