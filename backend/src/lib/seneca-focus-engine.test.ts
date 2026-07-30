import { describe, expect, test } from "bun:test";
import {
  buildFallbackCandidate,
  buildFocusCandidates,
  buildMaterialFingerprint,
  canAccessSenecaFocus,
  isFocusRefreshCoolingDown,
  isCandidateResolved,
  scoreFocusCandidate,
  selectFocusCandidate,
  type SenecaFocusFacts,
} from "./seneca-focus-engine";
import {
  deterministicFocusCopy,
  permissionSafeFocusSystemPrompt,
  validateFocusCopy,
} from "./seneca-focus-copy";

function facts(overrides: Partial<SenecaFocusFacts> = {}): SenecaFocusFacts {
  return {
    teamId: "team-1",
    memberCount: 2,
    members: [
      {
        id: "u1",
        name: "Alex",
        checkInRisk: "on_track",
        goalsStatus: "on_track",
        openManagerAssignedTasks: 0,
      },
      {
        id: "u2",
        name: "Sam",
        checkInRisk: "on_track",
        goalsStatus: "on_track",
        openManagerAssignedTasks: 0,
      },
    ],
    tasks: [],
    goals: [],
    recognizedMemberIdsLast14Days: [],
    recentlyCompletedMemberIds: [],
    health: {
      currentPct: 100,
      checkInPct: 100,
      goalsPct: 100,
      tasksPct: 100,
      recentPcts: [100, 100, 100],
      openTaskAssignments: 0,
      overdueTaskAssignments: 0,
    },
    ...overrides,
  };
}

describe("Seneca focus scoring", () => {
  test("limits manager briefs to approved leadership roles", () => {
    expect(canAccessSenecaFocus("owner")).toBe(true);
    expect(canAccessSenecaFocus("team_leader")).toBe(true);
    expect(canAccessSenecaFocus("admin")).toBe(true);
    expect(canAccessSenecaFocus("member")).toBe(false);
    expect(canAccessSenecaFocus(null)).toBe(false);
  });

  test("enforces refresh cooldown boundaries", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    expect(isFocusRefreshCoolingDown(new Date("2026-07-28T12:00:01.000Z"), now)).toBe(true);
    expect(isFocusRefreshCoolingDown(new Date("2026-07-28T12:00:00.000Z"), now)).toBe(false);
    expect(isFocusRefreshCoolingDown(null, now)).toBe(false);
  });

  test("uses the accepted weighted formula", () => {
    expect(
      scoreFocusCandidate({
        urgency: 100,
        impact: 100,
        affected: 100,
        ease: 100,
        unlock: 100,
        supportedPattern: 100,
      }),
    ).toBe(100);
    expect(
      scoreFocusCandidate({
        urgency: 100,
        impact: 0,
        affected: 0,
        ease: 0,
        unlock: 0,
        supportedPattern: 0,
      }),
    ).toBe(35);
  });

  test("critical overdue task outranks routine goal coverage", () => {
    const input = facts({
      members: [
        {
          id: "u1",
          name: "Alex",
          checkInRisk: "on_track",
          goalsStatus: "missing_goals",
          openManagerAssignedTasks: 0,
        },
      ],
      memberCount: 1,
      tasks: [
        {
          id: "t1",
          title: "Critical task",
          priority: "high",
          dueDate: "2026-07-27T12:00:00.000Z",
          assigneeIds: ["u1"],
          overdue: true,
          upcoming: false,
          createdByManager: true,
        },
      ],
      health: {
        currentPct: 33,
        checkInPct: 100,
        goalsPct: 0,
        tasksPct: 0,
        recentPcts: [],
        openTaskAssignments: 1,
        overdueTaskAssignments: 1,
      },
    });
    expect(selectFocusCandidate(input).selected.id).toBe("tasks:high_overdue");
  });

  test("stable IDs break equal-score ties", () => {
    const candidates = buildFocusCandidates(
      facts({
        health: {
          currentPct: 80,
          checkInPct: 80,
          goalsPct: 80,
          tasksPct: 80,
          recentPcts: [90, 85, 80],
          openTaskAssignments: 0,
          overdueTaskAssignments: 0,
        },
      }),
    );
    const sorted = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    expect(candidates.map((item) => item.id)).toEqual(sorted.map((item) => item.id));
  });
});

describe("Seneca focus grounding", () => {
  test("fingerprint is stable across source ordering", () => {
    const a = facts({ recognizedMemberIdsLast14Days: ["u2", "u1"] });
    const b = facts({ recognizedMemberIdsLast14Days: ["u1", "u2"] });
    expect(buildMaterialFingerprint(a)).toBe(buildMaterialFingerprint(b));
  });

  test("returns positive and low-data fallbacks", () => {
    expect(buildFallbackCandidate(facts()).category).toBe("momentum");
    expect(
      buildFallbackCandidate(
        facts({ recentlyCompletedMemberIds: ["u1"] }),
      ).action,
    ).toBe("create_recognition");
    expect(
      buildFallbackCandidate(
        facts({
          memberCount: 0,
          members: [],
          health: {
            currentPct: null,
            checkInPct: null,
            goalsPct: null,
            tasksPct: null,
            recentPcts: [],
            openTaskAssignments: 0,
            overdueTaskAssignments: 0,
          },
        }),
      ).category,
    ).toBe("low_data");
  });

  test("detects measurable resolution", () => {
    const before = facts({
      members: [
        {
          id: "u1",
          name: "Alex",
          checkInRisk: "overdue",
          goalsStatus: "on_track",
          openManagerAssignedTasks: 0,
        },
      ],
      memberCount: 1,
    });
    const selected = selectFocusCandidate(before).selected;
    expect(isCandidateResolved(selected, facts({ memberCount: 1, members: [{ ...before.members[0]!, checkInRisk: "on_track" }] }))).toBe(true);
  });

  test("projects health only from calculable components", () => {
    const input = facts({
      memberCount: 2,
      members: [
        {
          id: "u1",
          name: "Alex",
          checkInRisk: "overdue",
          goalsStatus: "on_track",
          openManagerAssignedTasks: 0,
        },
        {
          id: "u2",
          name: "Sam",
          checkInRisk: "on_track",
          goalsStatus: "on_track",
          openManagerAssignedTasks: 0,
        },
      ],
      health: {
        currentPct: 83,
        checkInPct: 50,
        goalsPct: 100,
        tasksPct: 100,
        recentPcts: [],
        openTaskAssignments: 0,
        overdueTaskAssignments: 0,
      },
    });
    expect(selectFocusCandidate(input).selected.projectedHealthPct).toBe(100);
    expect(buildFallbackCandidate(facts()).projectedHealthPct).toBeNull();
  });

  test("rejects invented routes and uses deterministic fallback", () => {
    const input = facts();
    const selected = buildFallbackCandidate(input);
    expect(
      validateFocusCopy(
        {
          category: selected.category,
          mentionedMembers: [],
          summary: "Safe summary",
          rationale: "Safe rationale",
          keyInsights: [
            { label: "One", detail: "Grounded", status: "priority" },
            { label: "Two", detail: "Grounded", status: "risk" },
            { label: "Three", detail: "Grounded", status: "opportunity" },
          ],
          actions: [
            {
              action: selected.action,
              route: "/fabricated",
              title: "Do it",
              description: "Now",
            },
            {
              action: "open_team",
              route: "/(app)/team",
              title: "Review",
              description: "Review",
            },
          ],
        },
        selected,
        input,
      ),
    ).toBeNull();
    expect(deterministicFocusCopy(selected).actions.length).toBeGreaterThanOrEqual(2);
  });

  test("removes notes and knowledge from the copy prompt", () => {
    const prompt = permissionSafeFocusSystemPrompt(
      "# Global\nSafe\n\n# Workspace Operational Context (published, v1)\n## Workspace notes\nPrivate note\n\n# Knowledge base (active documents only)\n## Secret\nPrivate knowledge\n\n# Prompt template: Daily\nBe concise\n\n# Current request context\nSafe facts",
    );
    expect(prompt).not.toContain("Private note");
    expect(prompt).not.toContain("Private knowledge");
    expect(prompt).toContain("Prompt template: Daily");
    expect(prompt).toContain("Safe facts");
  });
});
