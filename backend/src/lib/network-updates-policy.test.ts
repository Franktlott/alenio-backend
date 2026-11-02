import { describe, expect, test } from "bun:test";
import {
  canAccessNetworkPost,
  isOwnedGenericUploadPath,
  isValidReactionEmoji,
  visibleNetworkAuthorCutoffs,
} from "./network-updates-policy";

describe("network updates authorization policy", () => {
  const firstAcceptance = new Date("2026-01-10T12:00:00.000Z");

  test("includes accepted connections with their current acceptance boundaries", () => {
    expect(
      visibleNetworkAuthorCutoffs(
        "me",
        [
          {
            requesterId: "me",
            recipientId: "accepted",
            status: "accepted",
            updatedAt: firstAcceptance,
          },
          {
            requesterId: "pending",
            recipientId: "me",
            status: "pending",
            updatedAt: firstAcceptance,
          },
          {
            requesterId: "unrelated-a",
            recipientId: "unrelated-b",
            status: "accepted",
            updatedAt: firstAcceptance,
          },
        ],
        [],
      ),
    ).toEqual([{ authorId: "accepted", visibleFrom: firstAcceptance }]);
  });

  test("excludes blocks in either direction", () => {
    const connections = [
      {
        requesterId: "me",
        recipientId: "i-blocked",
        status: "accepted",
        updatedAt: firstAcceptance,
      },
      {
        requesterId: "blocked-me",
        recipientId: "me",
        status: "accepted",
        updatedAt: firstAcceptance,
      },
      {
        requesterId: "me",
        recipientId: "visible",
        status: "accepted",
        updatedAt: firstAcceptance,
      },
    ];
    const blocks = [
      { blockerId: "me", blockedId: "i-blocked" },
      { blockerId: "blocked-me", blockedId: "me" },
    ];
    expect(visibleNetworkAuthorCutoffs("me", connections, blocks)).toEqual([
      { authorId: "visible", visibleFrom: firstAcceptance },
    ]);
  });

  test("allows connection posts at or after the acceptance boundary", () => {
    const cutoffs = [{ authorId: "connection", visibleFrom: firstAcceptance }];
    expect(
      canAccessNetworkPost(
        "me",
        "connection",
        new Date("2026-01-10T11:59:59.999Z"),
        cutoffs,
      ),
    ).toBe(false);
    expect(canAccessNetworkPost("me", "connection", firstAcceptance, cutoffs)).toBe(true);
    expect(
      canAccessNetworkPost(
        "me",
        "connection",
        new Date("2026-01-10T12:00:00.001Z"),
        cutoffs,
      ),
    ).toBe(true);
  });

  test("always permits all of the viewer's own posts", () => {
    expect(
      canAccessNetworkPost(
        "me",
        "me",
        new Date("2000-01-01T00:00:00.000Z"),
        [],
      ),
    ).toBe(true);
    expect(canAccessNetworkPost("me", "stranger", firstAcceptance, [])).toBe(false);
    expect(canAccessNetworkPost("me", null, firstAcceptance, [])).toBe(false);
  });

  test("uses a later updatedAt after reconnection so old posts stay hidden", () => {
    const reconnection = new Date("2026-02-20T08:30:00.000Z");
    const cutoffs = visibleNetworkAuthorCutoffs(
      "me",
      [
        {
          requesterId: "connection",
          recipientId: "me",
          status: "accepted",
          updatedAt: reconnection,
        },
      ],
      [],
    );

    expect(
      canAccessNetworkPost(
        "me",
        "connection",
        new Date("2026-02-20T08:29:59.999Z"),
        cutoffs,
      ),
    ).toBe(false);
    expect(canAccessNetworkPost("me", "connection", reconnection, cutoffs)).toBe(true);
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

