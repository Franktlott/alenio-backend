import { describe, expect, test } from "bun:test";
import {
  decodePersonalFeedCursor,
  encodePersonalFeedCursor,
  networkAudienceVisibilityWhere,
  serializePersonalFeedItem,
  workspaceAudienceVisibilityWhere,
} from "./personal-feed";

describe("personal feed cursor", () => {
  test("round-trips", () => {
    const encoded = encodePersonalFeedCursor({
      createdAt: "2026-11-15T12:00:00.000Z",
      id: "act_1",
    });
    expect(decodePersonalFeedCursor(encoded)).toEqual({
      createdAt: "2026-11-15T12:00:00.000Z",
      id: "act_1",
    });
  });

  test("rejects garbage", () => {
    expect(decodePersonalFeedCursor("not-a-cursor")).toBeUndefined();
  });
});

describe("serializePersonalFeedItem", () => {
  test("labels network vs workspace from audience columns", () => {
    const network = serializePersonalFeedItem(
      {
        id: "1",
        teamId: null,
        type: "network_post",
        audienceKind: "network",
        audienceTeamId: null,
        metadata: JSON.stringify({ body: "hi" }),
        createdAt: new Date("2026-11-15T12:00:00.000Z"),
        userId: "u1",
        user: { id: "u1", name: "Ada", image: null },
        reactions: [],
        _count: { comments: 0 },
        team: null,
      },
      "u1",
    );
    expect(network).toMatchObject({
      source: "network",
      sourceLabel: "Network",
      canDelete: true,
    });

    const workspace = serializePersonalFeedItem(
      {
        id: "2",
        teamId: "t1",
        type: "post",
        audienceKind: "workspace",
        audienceTeamId: "t1",
        metadata: JSON.stringify({ body: "team" }),
        createdAt: new Date("2026-11-15T12:00:00.000Z"),
        userId: "u2",
        user: { id: "u2", name: "Bo", image: null },
        reactions: [],
        _count: { comments: 1 },
        team: { id: "t1", name: "Acme Ops" },
      },
      "u1",
    );
    expect(workspace).toMatchObject({
      source: "workspace",
      sourceLabel: "Acme Ops",
      canDelete: false,
      commentCount: 1,
    });

    const alenio = serializePersonalFeedItem(
      {
        id: "3",
        teamId: null,
        type: "alenio_post",
        audienceKind: "alenio",
        audienceTeamId: null,
        commentsLocked: true,
        metadata: JSON.stringify({ body: "Hello everyone" }),
        createdAt: new Date("2026-11-15T12:00:00.000Z"),
        userId: "staff1",
        user: { id: "staff1", name: "Staff", image: null },
        reactions: [],
        _count: { comments: 0 },
        team: null,
      },
      "staff1",
    );
    expect(alenio).toMatchObject({
      source: "alenio",
      sourceLabel: "Alenio",
      canDelete: false,
      commentsLocked: true,
      user: { id: "alenio", name: "Alenio", image: null },
    });
  });

  test("falls back to legacy type/teamId when audience is null", () => {
    const network = serializePersonalFeedItem(
      {
        id: "1",
        teamId: null,
        type: "network_post",
        audienceKind: null,
        audienceTeamId: null,
        metadata: null,
        createdAt: new Date("2026-11-15T12:00:00.000Z"),
        userId: "u1",
        user: { id: "u1", name: "Ada", image: null },
        reactions: [],
        _count: { comments: 0 },
        team: null,
      },
      "u1",
    );
    expect(network.source).toBe("network");
  });
});

describe("audience visibility where", () => {
  test("network clause prefers audienceKind", () => {
    const where = networkAudienceVisibilityWhere({ OR: [{ userId: "me" }] });
    expect(where.OR).toContainEqual({ audienceKind: "network" });
    expect(where.OR).toContainEqual({
      audienceKind: null,
      teamId: null,
      type: "network_post",
    });
  });

  test("workspace clause includes membership teams", () => {
    const where = workspaceAudienceVisibilityWhere(["t1", "t2"]);
    expect(where.OR[0]).toMatchObject({
      audienceKind: "workspace",
      audienceTeamId: { in: ["t1", "t2"] },
    });
  });
});
