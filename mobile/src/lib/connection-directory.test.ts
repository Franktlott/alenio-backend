import { describe, expect, test } from "bun:test";
import {
  filterConnectionDirectory,
  isRecentConnection,
  RECENT_CONNECTION_WINDOW_MS,
  sortConnectionDirectory,
} from "./connection-directory";
import type { AcceptedConnectionEntry } from "./types";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function connection(
  id: string,
  overrides: Partial<AcceptedConnectionEntry> = {},
): AcceptedConnectionEntry {
  return {
    id,
    status: "connected",
    activeNow: false,
    sharesWorkspace: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    person: {
      id: `person-${id}`,
      name: id,
      username: id,
      image: null,
    },
    ...overrides,
  };
}

describe("filterConnectionDirectory", () => {
  test("matches on job title and shared workspace name", () => {
    const entries = [
      connection("a", {
        person: {
          id: "person-a",
          name: "a",
          username: "a",
          image: null,
          profileTitle: "Food & Beverage Manager",
        },
      }),
      connection("b", { sharedWorkspaceNames: ["Store 5101"] }),
      connection("c"),
    ];

    expect(
      filterConnectionDirectory(entries, { search: "beverage" }).map((row) => row.id),
    ).toEqual(["a"]);
    expect(
      filterConnectionDirectory(entries, { search: "5101" }).map((row) => row.id),
    ).toEqual(["b"]);
  });

  test("searches names and @usernames locally without changing order", () => {
    const entries = [
      connection("first", { person: { id: "1", name: "Ava Chen", username: "achen", image: null } }),
      connection("second", { person: { id: "2", name: "Avery Stone", username: "stone", image: null } }),
      connection("third", { person: { id: "3", name: "Jordan Lee", username: "ava", image: null } }),
    ];

    expect(filterConnectionDirectory(entries, { search: "av" }).map((item) => item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(filterConnectionDirectory(entries, { search: "@ava" }).map((item) => item.id)).toEqual([
      "third",
    ]);
  });

  test("includes exactly 30 days and excludes anything older", () => {
    const boundary = new Date(NOW.getTime() - RECENT_CONNECTION_WINDOW_MS).toISOString();
    const tooOld = new Date(NOW.getTime() - RECENT_CONNECTION_WINDOW_MS - 1).toISOString();

    expect(isRecentConnection(boundary, NOW)).toBe(true);
    expect(isRecentConnection(tooOld, NOW)).toBe(false);
  });

  test("includes the current instant but rejects future and invalid dates", () => {
    expect(isRecentConnection(NOW.toISOString(), NOW)).toBe(true);
    expect(isRecentConnection(new Date(NOW.getTime() + 1).toISOString(), NOW)).toBe(false);
    expect(isRecentConnection("not-a-date", NOW)).toBe(false);
  });

  test("supports active, recent, and shared workspace quick scopes", () => {
    const entries = [
      connection("active", { activeNow: true }),
      connection("recent", { updatedAt: NOW.toISOString() }),
      connection("shared", { sharesWorkspace: true }),
    ];

    expect(filterConnectionDirectory(entries, { quickScope: "active", now: NOW }).map((item) => item.id)).toEqual(["active"]);
    expect(filterConnectionDirectory(entries, { quickScope: "recent", now: NOW }).map((item) => item.id)).toEqual(["recent"]);
    expect(filterConnectionDirectory(entries, { quickScope: "shared_workspace", now: NOW }).map((item) => item.id)).toEqual(["shared"]);
  });

  test("applies combined filters with AND semantics", () => {
    const entries = [
      connection("all-three", {
        activeNow: true,
        sharesWorkspace: true,
        updatedAt: NOW.toISOString(),
      }),
      connection("missing-shared", {
        activeNow: true,
        updatedAt: NOW.toISOString(),
      }),
      connection("missing-active", {
        sharesWorkspace: true,
        updatedAt: NOW.toISOString(),
      }),
    ];

    expect(
      filterConnectionDirectory(entries, {
        filters: { active: true, recent: true, sharedWorkspace: true },
        now: NOW,
      }).map((item) => item.id),
    ).toEqual(["all-three"]);
  });

  test("preserves backend relevance ordering through filters", () => {
    const entries = [
      connection("ranked-first", { sharesWorkspace: true }),
      connection("ranked-second"),
      connection("ranked-third", { sharesWorkspace: true }),
    ];
    const snapshot = [...entries];

    expect(
      filterConnectionDirectory(entries, { filters: { sharedWorkspace: true } }).map(
        (item) => item.id,
      ),
    ).toEqual(["ranked-first", "ranked-third"]);
    expect(entries).toEqual(snapshot);
  });
});
