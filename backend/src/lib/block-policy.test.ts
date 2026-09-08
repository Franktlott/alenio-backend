import { describe, expect, test } from "bun:test";
import {
  describeBidirectionalBlockStatus,
  findBlockedGroupPairs,
  findBlockedMentionIds,
  findNewlyIntroducedBlockedGroupPairs,
  type BlockRow,
} from "./block-policy";

const blocks: BlockRow[] = [
  { blockerId: "alice", blockedId: "bob" },
  { blockerId: "carol", blockedId: "alice" },
  { blockerId: "dave", blockedId: "erin" },
];

describe("voluntary conversation group block policy", () => {
  test("rejects a blocked pair regardless of who initiated the block", () => {
    expect(findBlockedGroupPairs(["alice", "bob", "carol"], blocks)).toEqual([
      { blockerId: "alice", blockedId: "bob" },
      { blockerId: "carol", blockedId: "alice" },
    ]);
  });

  test("allows ordinary group membership when no participant pair is blocked", () => {
    expect(findBlockedGroupPairs(["alice", "dave"], blocks)).toEqual([]);
  });

  test("does not treat a block outside the proposed group as a conflict", () => {
    expect(findBlockedGroupPairs(["alice", "carol"], [
      { blockerId: "alice", blockedId: "bob" },
    ])).toEqual([]);
  });

  test("permits unrelated additions to a legacy group that already contains a blocked pair", () => {
    expect(
      findNewlyIntroducedBlockedGroupPairs(
        ["alice", "bob", "dave"],
        ["dave"],
        [{ blockerId: "alice", blockedId: "bob" }],
      ),
    ).toEqual([]);
    expect(
      findNewlyIntroducedBlockedGroupPairs(
        ["alice", "bob", "dave"],
        ["bob"],
        [{ blockerId: "alice", blockedId: "bob" }],
      ),
    ).toHaveLength(1);
  });
});

describe("direct mention block policy", () => {
  test("rejects mentions in both block directions", () => {
    expect(findBlockedMentionIds("alice", ["bob", "carol", "dave"], blocks).sort()).toEqual([
      "bob",
      "carol",
    ]);
  });

  test("allows ordinary content and unrelated mentions", () => {
    expect(findBlockedMentionIds("alice", [], blocks)).toEqual([]);
    expect(findBlockedMentionIds("alice", ["dave"], blocks)).toEqual([]);
  });

  test("deduplicates blocked mention IDs and ignores self", () => {
    expect(findBlockedMentionIds("alice", ["alice", "bob", "bob"], blocks)).toEqual(["bob"]);
  });
});

describe("bidirectional block serialization", () => {
  test("distinguishes neither, each direction, and both", () => {
    expect(describeBidirectionalBlockStatus("alice", "bob", [])).toEqual({
      blockedByMe: false,
      blockedByThem: false,
      status: null,
    });
    expect(describeBidirectionalBlockStatus("alice", "bob", blocks)).toEqual({
      blockedByMe: true,
      blockedByThem: false,
      status: "blocked_by_me",
    });
    expect(
      describeBidirectionalBlockStatus("alice", "carol", blocks),
    ).toEqual({
      blockedByMe: false,
      blockedByThem: true,
      status: "blocked_by_them",
    });
    expect(
      describeBidirectionalBlockStatus("alice", "bob", [
        { blockerId: "alice", blockedId: "bob" },
        { blockerId: "bob", blockedId: "alice" },
      ]),
    ).toEqual({
      blockedByMe: true,
      blockedByThem: true,
      status: "blocked_both",
    });
  });
});
