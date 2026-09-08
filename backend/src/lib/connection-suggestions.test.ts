import { describe, expect, test } from "bun:test";
import {
  buildConnectionSuggestions,
  type ConnectionSuggestionCandidate,
} from "./connection-suggestions";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function candidate(
  id: string,
  overrides: Partial<ConnectionSuggestionCandidate> = {},
): ConnectionSuggestionCandidate {
  return {
    person: { id, name: id, username: id, image: null },
    sharedWorkspaces: [],
    mutualConnections: 0,
    sharesOrganization: false,
    ...overrides,
  };
}

function workspace(id: string, joinedAt = "2026-07-01T12:00:00.000Z") {
  return {
    id,
    name: `Workspace ${id}`,
    role: "member",
    joinedAt: new Date(joinedAt),
  };
}

describe("buildConnectionSuggestions", () => {
  test("ranks evidence in the documented priority order", () => {
    const result = buildConnectionSuggestions({
      currentTeamId: "current",
      limit: 20,
      now: NOW,
      candidates: [
        candidate("secondary", { sharedWorkspaces: [workspace("secondary")] }),
        candidate("organization", { sharesOrganization: true }),
        candidate("mutual-one", { mutualConnections: 1 }),
        candidate("mutual-three", { mutualConnections: 3 }),
        candidate("current", { sharedWorkspaces: [workspace("current")] }),
      ],
    });

    expect(result.map((entry) => entry.person.id)).toEqual([
      "current",
      "mutual-three",
      "mutual-one",
      "organization",
      "secondary",
    ]);
    expect(result[0]?.sharedCurrentWorkspace).toBe(true);
    expect(result[0]?.currentWorkspace).toMatchObject({ id: "current", role: "member" });
    expect(result[0]?.reasons[0]).toEqual({
      key: "current_workspace",
      label: "Current workspace",
    });
  });

  test("deduplicates people and shared workspaces while combining evidence", () => {
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      candidates: [
        candidate("person", {
          mutualConnections: 1,
          sharedWorkspaces: [workspace("shared", "2026-01-01T00:00:00.000Z")],
        }),
        candidate("person", {
          mutualConnections: 2,
          sharesOrganization: true,
          sharedWorkspaces: [
            workspace("shared", "2026-07-01T00:00:00.000Z"),
            workspace("other"),
          ],
        }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.mutualConnections).toBe(2);
    expect(result[0]?.sharedWorkspaces.map((entry) => entry.id)).toEqual(["other", "shared"]);
    expect(result[0]?.reasons.map((reason) => reason.key)).toEqual([
      "mutual_connections",
      "same_organization",
      "shared_workspace",
      "recently_joined_workspace",
    ]);
  });

  test("keeps at most two mutual faces and the richer preview when merging", () => {
    const faces = [
      { id: "lee", name: "Lee Ann", image: null },
      { id: "todd", name: "Todd A", image: null },
      { id: "mira", name: "Mira B", image: null },
    ];
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      candidates: [
        candidate("person", { mutualConnections: 3 }),
        candidate("person", { mutualConnections: 3, mutualPreview: faces }),
      ],
    });

    expect(result[0]?.mutualPreview).toEqual(faces.slice(0, 2));
  });

  test("excludes accepted, pending, blocked and declined people in cooldown", () => {
    const evidence = { sharedWorkspaces: [workspace("shared")] };
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      candidates: [
        candidate("accepted", {
          ...evidence,
          connection: { status: "accepted", updatedAt: NOW },
        }),
        candidate("pending", {
          ...evidence,
          connection: { status: "pending", updatedAt: NOW },
        }),
        candidate("blocked", { ...evidence, blocked: true }),
        candidate("recent-decline", {
          ...evidence,
          connection: {
            status: "declined",
            updatedAt: new Date("2026-07-20T12:00:00.000Z"),
          },
        }),
      ],
    });

    expect(result).toEqual([]);
  });

  test("returns an old decline as declined once the 30-day cooldown expires", () => {
    const [result] = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      candidates: [
        candidate("eligible-again", {
          sharedWorkspaces: [workspace("shared")],
          connection: {
            status: "declined",
            updatedAt: new Date("2026-07-10T12:00:00.000Z"),
          },
        }),
      ],
    });

    expect(result?.connectionStatus).toBe("declined");
  });

  test("excludes an actively dismissed suggestion", () => {
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      dismissedAtByPersonId: new Map([
        ["dismissed", new Date("2026-07-20T12:00:00.000Z")],
      ]),
      candidates: [
        candidate("dismissed", {
          sharedWorkspaces: [workspace("shared")],
        }),
      ],
    });

    expect(result).toEqual([]);
  });

  test("returns a dismissed suggestion after the 90-day cooldown expires", () => {
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      dismissedAtByPersonId: new Map([
        ["eligible-again", new Date("2026-05-01T12:00:00.000Z")],
      ]),
      candidates: [
        candidate("eligible-again", {
          sharedWorkspaces: [workspace("shared")],
        }),
      ],
    });

    expect(result.map((entry) => entry.person.id)).toEqual(["eligible-again"]);
  });

  test("does not return a user whose only input is a prior relationship row", () => {
    const result = buildConnectionSuggestions({
      limit: 20,
      now: NOW,
      candidates: [
        candidate("no-evidence"),
        candidate("old-decline-no-evidence", {
          connection: {
            status: "declined",
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        }),
      ],
    });

    expect(result).toEqual([]);
  });
});
