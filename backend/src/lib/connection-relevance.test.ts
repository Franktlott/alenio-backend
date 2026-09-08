import { describe, expect, test } from "bun:test";
import {
  rankConnectionsByRelevance,
  type ConnectionRelevanceSignals,
} from "./connection-relevance";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function candidate(
  candidateId: string,
  overrides: Partial<ConnectionRelevanceSignals> = {},
): ConnectionRelevanceSignals & { publicValue: string } {
  return {
    candidateId,
    activeNow: false,
    lastDirectMessageAt: null,
    recentDirectMessageCount: 0,
    connectionUpdatedAt: new Date("2025-01-01T00:00:00.000Z"),
    sharedWorkspaceCount: 0,
    publicValue: candidateId,
    ...overrides,
  };
}

function ids(
  candidates: Array<ConnectionRelevanceSignals & { publicValue: string }>,
  now = NOW,
): string[] {
  return rankConnectionsByRelevance(candidates, { viewerId: "viewer", now }).map(
    (entry) => entry.candidateId,
  );
}

describe("rankConnectionsByRelevance", () => {
  test("always ranks active connections first", () => {
    expect(
      ids([
        candidate("strong-inactive", {
          lastDirectMessageAt: NOW,
          recentDirectMessageCount: 100,
          sharedWorkspaceCount: 5,
        }),
        candidate("active", { activeNow: true }),
      ]),
    ).toEqual(["active", "strong-inactive"]);
  });

  test("meaningful recent DM, frequency, acceptance, and workspace signals dominate jitter", () => {
    expect(
      ids([
        candidate("baseline"),
        candidate("workspace", { sharedWorkspaceCount: 1 }),
        candidate("accepted-recently", { connectionUpdatedAt: NOW }),
        candidate("frequent", { recentDirectMessageCount: 2 }),
        candidate("recent-dm", { lastDirectMessageAt: NOW }),
      ]),
    ).toEqual(["recent-dm", "accepted-recently", "workspace", "frequent", "baseline"]);
  });

  test("is stable throughout a UTC day", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const morning = ids(candidates, new Date("2026-08-09T00:01:00.000Z"));
    const evening = ids(candidates, new Date("2026-08-09T23:59:00.000Z"));

    expect(evening).toEqual(morning);
  });

  test("daily jitter can rotate otherwise equal candidates", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
    const orders = new Set(
      Array.from({ length: 14 }, (_, offset) =>
        ids(candidates, new Date(Date.UTC(2026, 7, 1 + offset))).join(","),
      ),
    );

    expect(orders.size).toBeGreaterThan(1);
  });

  test("uses candidate ID as a deterministic final tie-break and returns no ranking fields", () => {
    // These IDs have the same daily jitter on the fixed date, so only the
    // privacy-neutral candidate ID tie-break can separate them.
    const first = candidate("candidate-0");
    const second = candidate("candidate-8");
    const result = rankConnectionsByRelevance([second, first], {
      viewerId: "viewer",
      now: NOW,
    });

    expect(result.map((entry) => entry.candidateId)).toEqual(["candidate-0", "candidate-8"]);
    expect(Object.keys(result[0]!).sort()).toEqual(
      [
        "activeNow",
        "candidateId",
        "connectionUpdatedAt",
        "lastDirectMessageAt",
        "publicValue",
        "recentDirectMessageCount",
        "sharedWorkspaceCount",
      ].sort(),
    );
  });
});
