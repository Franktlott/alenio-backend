import { describe, expect, test } from "bun:test";
import {
  activitySourceFromAudience,
  inferActivityAudience,
  networkAudienceFields,
  workspaceAudienceFields,
} from "./activity-audience";

describe("activity audience helpers", () => {
  test("create helpers", () => {
    expect(networkAudienceFields()).toEqual({
      audienceKind: "network",
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
      activitySourceFromAudience(
        { audienceKind: "workspace", audienceTeamId: "t1" },
        "Acme",
      ),
    ).toEqual({ source: "workspace", sourceLabel: "Acme" });
  });
});
