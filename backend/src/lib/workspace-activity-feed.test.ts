import { describe, expect, test } from "bun:test";
import {
  parseActivityMetadata,
  personalCelebrationBelongsToTeam,
} from "./workspace-activity-feed";

describe("personalCelebrationBelongsToTeam", () => {
  const members = new Set(["frank", "maya"]);

  test("includes recognition between two teammates", () => {
    expect(
      personalCelebrationBelongsToTeam({
        actorUserId: "frank",
        metadata: { targetUserId: "maya" },
        memberIds: members,
      }),
    ).toBe(true);
  });

  test("excludes recognition of someone outside the workspace", () => {
    expect(
      personalCelebrationBelongsToTeam({
        actorUserId: "frank",
        metadata: { targetUserId: "outsider" },
        memberIds: members,
      }),
    ).toBe(false);
  });

  test("excludes recognition sent by a non-member", () => {
    expect(
      personalCelebrationBelongsToTeam({
        actorUserId: "outsider",
        metadata: { targetUserId: "maya" },
        memberIds: members,
      }),
    ).toBe(false);
  });
});

describe("parseActivityMetadata", () => {
  test("reads targetUserId from stored JSON", () => {
    expect(
      parseActivityMetadata('{"targetUserId":"maya","celebrationType":"teamwork"}'),
    ).toEqual({
      targetUserId: "maya",
      celebrationType: "teamwork",
    });
  });

  test("returns null for invalid JSON", () => {
    expect(parseActivityMetadata("nope")).toBeNull();
  });
});
