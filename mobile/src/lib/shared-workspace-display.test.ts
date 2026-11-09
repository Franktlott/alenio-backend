import { describe, expect, test } from "bun:test";
import {
  filterSharedWorkspaces,
  formatWorkspaceSince,
  sortSharedWorkspaces,
  workspaceTileInitials,
  workspaceTileTint,
  WORKSPACE_TILE_TINTS,
} from "./shared-workspace-display";
import type { PublicProfileWorkspace } from "./types";

function workspace(
  id: string,
  overrides: Partial<PublicProfileWorkspace> = {},
): PublicProfileWorkspace {
  return {
    id,
    name: id,
    image: null,
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspaceTileInitials", () => {
  test("takes the first letter of the first two meaningful words", () => {
    expect(workspaceTileInitials("People Dev · Northstar")).toBe("PD");
    expect(workspaceTileInitials("Lott Technologies Group, LLC")).toBe("LT");
    expect(workspaceTileInitials("Store 5101")).toBe("S5");
  });

  test("falls back for single words and empty names", () => {
    expect(workspaceTileInitials("Fieldstone")).toBe("FI");
    expect(workspaceTileInitials("   ")).toBe("WS");
    expect(workspaceTileInitials("···")).toBe("WS");
  });
});

describe("workspaceTileTint", () => {
  test("is stable per id and always a palette entry", () => {
    expect(workspaceTileTint("team-a")).toEqual(workspaceTileTint("team-a"));
    for (const id of ["a", "team-1", "seed-people-workspace-northstar", ""]) {
      expect(WORKSPACE_TILE_TINTS).toContain(workspaceTileTint(id));
    }
  });
});

describe("formatWorkspaceSince", () => {
  test("formats to month and year", () => {
    expect(formatWorkspaceSince("2026-09-08T12:00:00.000Z")).toBe("Sep 2026");
    expect(formatWorkspaceSince("2024-08-15T00:00:00.000Z")).toBe("Aug 2024");
  });

  test("returns null for missing or invalid input", () => {
    expect(formatWorkspaceSince(null)).toBeNull();
    expect(formatWorkspaceSince(undefined)).toBeNull();
    expect(formatWorkspaceSince("")).toBeNull();
    expect(formatWorkspaceSince("not-a-date")).toBeNull();
  });
});

describe("filterSharedWorkspaces", () => {
  const workspaces = [
    workspace("a", { name: "People Dev · Northstar", role: "owner" }),
    workspace("b", { name: "Store 5101", role: "general_manager" }),
    workspace("c", { name: "Food Safety" }),
  ];

  test("matches name or role and ignores case and padding", () => {
    expect(filterSharedWorkspaces(workspaces, "  north ").map((row) => row.id)).toEqual(["a"]);
    expect(filterSharedWorkspaces(workspaces, "5101").map((row) => row.id)).toEqual(["b"]);
    expect(filterSharedWorkspaces(workspaces, "OWNER").map((row) => row.id)).toEqual(["a"]);
  });

  test("returns a copy of everything for an empty query", () => {
    const result = filterSharedWorkspaces(workspaces, "   ");
    expect(result).toEqual(workspaces);
    expect(result).not.toBe(workspaces);
  });
});

describe("sortSharedWorkspaces", () => {
  const workspaces = [
    workspace("older", { name: "Beta", joinedAt: "2024-05-01T00:00:00.000Z" }),
    workspace("newest", { name: "Cara", joinedAt: "2026-02-01T00:00:00.000Z" }),
    workspace("middle", { name: "Alpha", joinedAt: "2025-07-01T00:00:00.000Z" }),
  ];

  test("defaults to most recently shared and does not mutate", () => {
    const snapshot = [...workspaces];
    expect(sortSharedWorkspaces(workspaces).map((row) => row.id)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
    expect(workspaces).toEqual(snapshot);
  });

  test("sorts alphabetically on request", () => {
    expect(sortSharedWorkspaces(workspaces, "name").map((row) => row.id)).toEqual([
      "middle",
      "older",
      "newest",
    ]);
  });

  test("pushes unparseable dates last and breaks ties by name", () => {
    const messy = [
      workspace("bad-z", { name: "Zeta", joinedAt: "nope" }),
      workspace("bad-a", { name: "Aria", joinedAt: "nope" }),
      workspace("good", { name: "Mid", joinedAt: "2025-01-01T00:00:00.000Z" }),
    ];
    expect(sortSharedWorkspaces(messy).map((row) => row.id)).toEqual([
      "good",
      "bad-a",
      "bad-z",
    ]);
  });
});
