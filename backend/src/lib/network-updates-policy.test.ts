import { describe, expect, test } from "bun:test";
import {
  canAccessNetworkAuthor,
  isOwnedGenericUploadPath,
  isValidReactionEmoji,
  visibleNetworkAuthorIds,
} from "./network-updates-policy";

describe("network updates authorization policy", () => {
  test("includes only current accepted connections", () => {
    expect(
      visibleNetworkAuthorIds(
        "me",
        [
          { requesterId: "me", recipientId: "accepted", status: "accepted" },
          { requesterId: "pending", recipientId: "me", status: "pending" },
          { requesterId: "unrelated-a", recipientId: "unrelated-b", status: "accepted" },
        ],
        [],
      ),
    ).toEqual(["accepted"]);
  });

  test("excludes blocks in either direction", () => {
    const connections = [
      { requesterId: "me", recipientId: "i-blocked", status: "accepted" },
      { requesterId: "blocked-me", recipientId: "me", status: "accepted" },
      { requesterId: "me", recipientId: "visible", status: "accepted" },
    ];
    const blocks = [
      { blockerId: "me", blockedId: "i-blocked" },
      { blockerId: "blocked-me", blockedId: "me" },
    ];
    expect(visibleNetworkAuthorIds("me", connections, blocks)).toEqual(["visible"]);
  });

  test("always permits the viewer's own author id", () => {
    expect(canAccessNetworkAuthor("me", "me", [])).toBe(true);
    expect(canAccessNetworkAuthor("me", "connection", ["connection"])).toBe(true);
    expect(canAccessNetworkAuthor("me", "stranger", ["connection"])).toBe(false);
    expect(canAccessNetworkAuthor("me", null, ["connection"])).toBe(false);
  });
});

describe("network update emoji validation", () => {
  test("accepts one emoji grapheme", () => {
    expect(isValidReactionEmoji("👍🏽")).toBe(true);
    expect(isValidReactionEmoji("👨‍👩‍👧‍👦")).toBe(true);
    expect(isValidReactionEmoji("🇺🇸")).toBe(true);
  });

  test("rejects text, multiple emoji, and empty input", () => {
    expect(isValidReactionEmoji("like")).toBe(false);
    expect(isValidReactionEmoji("👍🔥")).toBe(false);
    expect(isValidReactionEmoji("")).toBe(false);
  });
});

describe("network update image ownership", () => {
  test("accepts only the author's generic upload slot", () => {
    expect(isOwnedGenericUploadPath("me", "users/me/uploads/123-photo.jpg")).toBe(true);
    expect(isOwnedGenericUploadPath("me", "users/other/uploads/123-photo.jpg")).toBe(false);
    expect(isOwnedGenericUploadPath("me", "users/me/profile/avatar")).toBe(false);
  });
});

