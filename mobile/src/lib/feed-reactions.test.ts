import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FEED_REACTION,
  FEED_REACTIONS,
  feedReaction,
  feedReactionLabel,
} from "./feed-reactions";

describe("feed reactions", () => {
  test("every option carries a name and an accent", () => {
    for (const reaction of FEED_REACTIONS) {
      expect(reaction.label.length).toBeGreaterThan(0);
      expect(reaction.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  test("the default tap reaction is one of the options", () => {
    expect(feedReaction(DEFAULT_FEED_REACTION)?.label).toBe("Love");
  });

  test("names the emoji a person picked", () => {
    expect(feedReactionLabel("🎉")).toBe("Celebrate");
    expect(feedReactionLabel("😂")).toBe("Haha");
  });

  test("still labels an emoji the app no longer offers", () => {
    expect(feedReaction("🥕")).toBeNull();
    expect(feedReactionLabel("🥕")).toBe("Reacted");
    expect(feedReactionLabel(null)).toBe("Reacted");
  });
});
