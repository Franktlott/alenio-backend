import { describe, expect, test } from "bun:test";
import type { SenecaFocusResponse } from "./seneca-focus";
import {
  senecaFocusDestination,
  senecaFocusPresentationState,
  senecaFocusStateLabel,
} from "./seneca-focus-presentation";

function response(
  status: SenecaFocusResponse["brief"]["status"],
  overrides: Partial<SenecaFocusResponse> = {},
): SenecaFocusResponse {
  return {
    reused: false,
    stale: false,
    generatedBy: "seneca",
    refreshAvailableAt: null,
    brief: {
      id: "brief-1",
      teamId: "team-1",
      localDate: "2026-07-28",
      category: "tasks",
      impact: "high",
      status,
      summary: "Act on the highest-value task.",
      rationale: "It blocks other work.",
      estimatedMinutes: 5,
      affectedCount: 1,
      affectedMemberIds: ["user-1"],
      confidence: 1,
      score: 90,
      projectedHealthPct: 95,
      keyInsights: [],
      actions: [],
      generatedAt: "2026-07-28T12:00:00.000Z",
      expiresAt: "2026-07-29T00:00:00.000Z",
      completedAt: null,
    },
    ...overrides,
  };
}

describe("Seneca focus presentation", () => {
  test("maps all compact-card lifecycle states", () => {
    expect(senecaFocusPresentationState(response("generated"))).toBe("generated");
    expect(senecaFocusPresentationState(response("positive"))).toBe("positive");
    expect(senecaFocusPresentationState(response("low_data"))).toBe("low_data");
    expect(senecaFocusPresentationState(response("completed"))).toBe("completed");
    expect(
      senecaFocusPresentationState(response("generated", { stale: true })),
    ).toBe("stale");
    expect(
      senecaFocusPresentationState(
        response("generated", { generatedBy: "deterministic" }),
      ),
    ).toBe("fallback");
    expect(senecaFocusStateLabel("fallback")).toBe("Data-based");
  });

  test("maps actions only to existing Alenio workflows", () => {
    expect(senecaFocusDestination("view_check_ins", "team-1")).toEqual({
      pathname: "/team-priority",
      params: { teamId: "team-1", filter: "checkInDue" },
    });
    expect(
      senecaFocusDestination("create_recognition", "team-1", ["user-1"]),
    ).toEqual({
      pathname: "/(app)/activity",
      params: {
        openCelebrate: "1",
        teamId: "team-1",
        targetUserId: "user-1",
      },
    });
    expect(senecaFocusDestination("view_workload", "team-1").pathname).toBe(
      "/(app)/execute",
    );
  });
});
