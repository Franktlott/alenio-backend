import { describe, expect, test } from "bun:test";
import {
  buildPostAudienceOptions,
  postAudienceFromParams,
  postDestinationConfirmCopy,
  postDestinationSummary,
} from "./post-audience";

describe("postAudienceFromParams", () => {
  test("prefers network scope", () => {
    expect(postAudienceFromParams({ scope: "network", teamId: "t1" })).toEqual({
      kind: "network",
    });
  });

  test("accepts public scope", () => {
    expect(postAudienceFromParams({ scope: "public" })).toEqual({
      kind: "public",
    });
  });

  test("uses workspace when teamId is set", () => {
    expect(
      postAudienceFromParams({ teamId: "t1", teamName: "Acme" }),
    ).toEqual({
      kind: "workspace",
      teamId: "t1",
      teamName: "Acme",
    });
  });
});

describe("buildPostAudienceOptions", () => {
  test("lists network, public, then workspaces", () => {
    expect(
      buildPostAudienceOptions({
        teams: [{ id: "t1", name: "Acme" }],
        networkConnectionCount: 4,
      }).map((option) => option.key),
    ).toEqual(["network", "public", "workspace:t1"]);
  });
});

describe("destination copy", () => {
  test("summarizes network, public, and workspace", () => {
    expect(postDestinationSummary({ kind: "network" }, 3)).toEqual({
      title: "My network",
      detail: "3 connections",
    });
    expect(postDestinationSummary({ kind: "public" })).toEqual({
      title: "Public",
      detail: "Everyone on Alenio",
    });
    expect(
      postDestinationSummary({
        kind: "workspace",
        teamId: "t1",
        teamName: "Acme Ops",
      }),
    ).toEqual({
      title: "Acme Ops",
      detail: "Everyone in this workspace",
    });
  });

  test("confirm copy names the destination", () => {
    expect(postDestinationConfirmCopy({ kind: "network" }, 2).title).toBe(
      "Post to your network?",
    );
    expect(postDestinationConfirmCopy({ kind: "public" }).title).toBe(
      "Post publicly?",
    );
    expect(
      postDestinationConfirmCopy({
        kind: "workspace",
        teamId: "t1",
        teamName: "Acme",
      }).title,
    ).toBe("Post to Acme?");
  });
});
