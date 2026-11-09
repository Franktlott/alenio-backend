import { describe, expect, test } from "bun:test";
import { discoverPlainText, sanitizeDiscoverDoc } from "./discover-document";

describe("sanitizeDiscoverDoc designed blocks", () => {
  test("keeps callouts, cards and checklists with clean attrs", () => {
    const doc = sanitizeDiscoverDoc({
      type: "doc",
      content: [
        { type: "discoverCallout", attrs: { icon: "target", tone: "blue", title: "Idea", text: "Body", layout: "side" } },
        {
          type: "discoverCards",
          attrs: {
            cards: [
              { icon: "users", tone: "purple", kicker: "FFFF", title: "Friendly", text: "Warm" },
              { icon: "<script>", tone: "neon", kicker: "A", title: "Accurate", text: "Right" },
              { title: "", text: "" },
            ],
          },
        },
        { type: "discoverChecklist", attrs: { title: "Do it", items: ["One", "", 4, "Two"], layout: "wide" } },
      ],
    });
    expect(doc.content).toEqual([
      { type: "discoverCallout", attrs: { icon: "target", tone: "blue", title: "Idea", text: "Body", layout: "side" } },
      {
        type: "discoverCards",
        attrs: {
          cards: [
            { icon: "users", tone: "purple", kicker: "FFF", title: "Friendly", text: "Warm" },
            { icon: "sparkles", tone: "purple", kicker: "A", title: "Accurate", text: "Right" },
          ],
        },
      },
      {
        type: "discoverChecklist",
        attrs: { icon: "rocket", tone: "purple", title: "Do it", items: ["One", "Two"], layout: "full" },
      },
    ]);
    expect(discoverPlainText(doc)).toBe("Idea Body Friendly Warm Accurate Right Do it One Two");
  });

  test("keeps known widths on top-level blocks only", () => {
    const doc = sanitizeDiscoverDoc({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { width: "1/2" }, content: [{ type: "text", text: "Left" }] },
        { type: "discoverCallout", attrs: { title: "Right", width: "1/2" } },
        { type: "heading", attrs: { level: 2, width: "full" }, content: [{ type: "text", text: "Full" }] },
        { type: "image", attrs: { src: "https://x.test/a.png", width: "3/4" } },
      ],
    });
    expect(doc.content.map((block) => (block.attrs as { width?: string } | undefined)?.width)).toEqual([
      "1/2",
      "1/2",
      undefined,
      undefined,
    ]);
  });

  test("drops empty designed blocks and caps cards at four", () => {
    const card = { title: "T", text: "x" };
    const doc = sanitizeDiscoverDoc({
      type: "doc",
      content: [
        { type: "discoverCallout", attrs: { title: " ", text: "" } },
        { type: "discoverCards", attrs: { cards: [card, card, card, card, card] } },
        { type: "discoverChecklist", attrs: { items: [] } },
      ],
    });
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type === "discoverCards" && doc.content[0].attrs.cards.length).toBe(4);
  });
});
