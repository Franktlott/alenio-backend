import { describe, expect, test } from "bun:test";
import {
  activityVisibleToTeam,
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

describe("activityVisibleToTeam", () => {
  const memberIds = new Set(["frank", "maya"]);
  const teamId = "team-1";

  test("accepts an activity the workspace owns", () => {
    expect(
      activityVisibleToTeam({
        activity: {
          teamId,
          type: "task_completed",
          userId: "frank",
          metadata: null,
        },
        teamId,
        memberIds,
      }),
    ).toBe(true);
  });

  test("accepts personal recognition between two teammates", () => {
    expect(
      activityVisibleToTeam({
        activity: {
          teamId: null,
          type: "celebration",
          userId: "frank",
          metadata: '{"targetUserId":"maya"}',
        },
        teamId,
        memberIds,
      }),
    ).toBe(true);
  });

  test("rejects an activity that belongs to another workspace", () => {
    expect(
      activityVisibleToTeam({
        activity: {
          teamId: "team-2",
          type: "celebration",
          userId: "frank",
          metadata: '{"targetUserId":"maya"}',
        },
        teamId,
        memberIds,
      }),
    ).toBe(false);
  });

  test("rejects personal activity that is not recognition between members", () => {
    expect(
      activityVisibleToTeam({
        activity: {
          teamId: null,
          type: "task_completed",
          userId: "frank",
          metadata: null,
        },
        teamId,
        memberIds,
      }),
    ).toBe(false);
    expect(
      activityVisibleToTeam({
        activity: {
          teamId: null,
          type: "celebration",
          userId: "frank",
          metadata: '{"targetUserId":"outsider"}',
        },
        teamId,
        memberIds,
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
