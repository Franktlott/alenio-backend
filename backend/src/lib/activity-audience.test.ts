import { describe, expect, test } from "bun:test";
import {
  activitySourceFromAudience,
  inferActivityAudience,
  networkAudienceFields,
  publicAudienceFields,
  workspaceAudienceFields,
} from "./activity-audience";

describe("activity audience helpers", () => {
  test("create helpers", () => {
    expect(networkAudienceFields()).toEqual({
      audienceKind: "network",
      audienceTeamId: null,
    });
    expect(publicAudienceFields()).toEqual({
      audienceKind: "public",
      audienceTeamId: null,
    });
    expect(workspaceAudienceFields("t1")).toEqual({
      audienceKind: "workspace",
      audienceTeamId: "t1",
    });
  });

  test("infers legacy network_post", () => {
    expect(
      inferActivityAudience({ type: "network_post", teamId: null }),
    ).toEqual({ audienceKind: "network", audienceTeamId: null });
  });

  test("infers legacy workspace row", () => {
    expect(
      inferActivityAudience({ type: "post", teamId: "t1" }),
    ).toEqual({ audienceKind: "workspace", audienceTeamId: "t1" });
  });

  test("prefers stored audience columns", () => {
    expect(
      inferActivityAudience({
        type: "network_post",
        teamId: null,
        audienceKind: "workspace",
        audienceTeamId: "t9",
      }),
    ).toEqual({ audienceKind: "workspace", audienceTeamId: "t9" });
  });

  test("source labels", () => {
    expect(activitySourceFromAudience({ audienceKind: "network", audienceTeamId: null })).toEqual({
      source: "network",
      sourceLabel: "Network",
    });
    expect(
      activitySourceFromAudience({ audienceKind: "public", audienceTeamId: null }),
    ).toEqual({
      source: "public",
      sourceLabel: "Public",
    });
    expect(
      activitySourceFromAudience(
        { audienceKind: "workspace", audienceTeamId: "t1" },
        "Acme",
      ),
    ).toEqual({ source: "workspace", sourceLabel: "Acme" });
  });

  test("prefers stored public audience", () => {
    expect(
      inferActivityAudience({
        type: "network_post",
        teamId: null,
        audienceKind: "public",
        audienceTeamId: null,
      }),
    ).toEqual({ audienceKind: "public", audienceTeamId: null });
  });
});
