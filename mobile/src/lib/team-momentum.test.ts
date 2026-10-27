import { describe, expect, test } from "bun:test";
import {
  effectiveTeamMomentumBand,
  momentumTaskTitle,
  presentTeamMomentumSummary,
  teamMomentumAccessState,
  teamMomentumAttention,
  teamMomentumRoster,
  type TeamMomentumGroupedMember,
  type TeamMomentumLeaderSummary,
} from "@/lib/team-momentum";

function member(
  userId: string,
  band: TeamMomentumGroupedMember["band"],
  lastQualifiedAt: string | null,
): TeamMomentumGroupedMember {
  return {
    teamMemberId: `membership-${userId}`,
    userId,
    name: userId,
    email: `${userId}@example.com`,
    image: null,
    role: "member",
    currentStreak: band === "strong" ? 3 : band === "building" ? 1 : 0,
    personalBestStreak: 4,
    momentumRunStartedAt: "2026-08-01T12:00:00.000Z",
    momentumLastQualifiedAt: lastQualifiedAt,
    completedThisMonth: 3,
    overdueTaskCount: 0,
    band,
  };
}

function summary(): TeamMomentumLeaderSummary {
  return {
    teamId: "team-1",
    generatedAt: "2026-08-27T12:00:00.000Z",
    activeWindowDays: 30,
    activeCount: 2,
    eligibleCount: 4,
    groups: {
      strong: [member("current-strong", "strong", "2026-08-26T12:00:00.000Z")],
      building: [
        member("stale-building", "building", "2026-07-01T12:00:00.000Z"),
      ],
      readyToRebuild: [
        member("ready", "ready_to_rebuild", "2026-06-01T12:00:00.000Z"),
      ],
    },
    notEnoughActivity: {
      count: 1,
      members: [
        {
          ...member("new", "ready_to_rebuild", null),
          reason: "no_qualifying_completions",
        },
      ],
    },
  };
}

describe("canonical team momentum presentation", () => {
  test("moves a stale earned run to Ready to rebuild", () => {
    const model = presentTeamMomentumSummary(summary());

    expect(model.activeCount).toBe(1);
    expect(model.strong.map((row) => row.userId)).toEqual(["current-strong"]);
    expect(model.building).toEqual([]);
    expect(model.readyToRebuild.map((row) => row.userId)).toEqual([
      "stale-building",
      "ready",
    ]);
    expect(model.notEnoughActivity.map((row) => row.userId)).toEqual(["new"]);
  });

  test("treats missing and invalid qualification timestamps as stale", () => {
    const missing = member("missing", "strong", null);
    const invalid = member("invalid", "building", "not-a-date");

    expect(
      effectiveTeamMomentumBand(missing, "strong", summary().generatedAt, 30),
    ).toBe("ready_to_rebuild");
    expect(
      effectiveTeamMomentumBand(invalid, "building", summary().generatedAt, 30),
    ).toBe("ready_to_rebuild");
  });

  test("uses private and deleted task copy without leaking titles", () => {
    expect(momentumTaskTitle({ title: null, incognito: true })).toBe(
      "Private task",
    );
    expect(momentumTaskTitle({ title: "Secret", incognito: true }, false)).toBe(
      "Private task",
    );
    expect(momentumTaskTitle({ title: null, incognito: false }, false)).toBe(
      "Deleted task",
    );
  });

  test("maps canonical 403 codes to distinct access states", () => {
    expect(
      teamMomentumAccessState({
        status: 403,
        body: { error: { code: "TEAM_MOMENTUM_LEADER_REQUIRED" } },
      }),
    ).toBe("leader_required");
    expect(
      teamMomentumAccessState({
        status: 403,
        body: { error: { code: "TEAM_MOMENTUM_PLAN_REQUIRED" } },
      }),
    ).toBe("plan_required");
    expect(teamMomentumAccessState(new Error("offline"))).toBe("unavailable");
  });
});

describe("team momentum roster", () => {
  test("flattens every band into one list, strongest first", () => {
    const rows = teamMomentumRoster(presentTeamMomentumSummary(summary()));

    expect(rows.map((row) => [row.member.userId, row.state])).toEqual([
      ["current-strong", "strong"],
      ["stale-building", "ready_to_rebuild"],
      ["ready", "ready_to_rebuild"],
      ["new", "not_enough_activity"],
    ]);
  });
});

describe("team momentum attention", () => {
  function rowsWith(
    overrides: Partial<TeamMomentumGroupedMember>[],
  ): ReturnType<typeof teamMomentumRoster> {
    const base = summary();
    base.groups.strong = overrides.map((override, index) => ({
      ...member(`m${index}`, "strong", base.generatedAt),
      ...override,
    }));
    base.groups.building = [];
    base.groups.readyToRebuild = [];
    base.notEnoughActivity = { count: 0, members: [] };
    return teamMomentumRoster(presentTeamMomentumSummary(base));
  }

  test("overdue work outranks everything else", () => {
    const attention = teamMomentumAttention(
      teamMomentumRoster(
        presentTeamMomentumSummary({
          ...summary(),
          groups: {
            ...summary().groups,
            strong: [
              {
                ...member("late", "strong", summary().generatedAt),
                name: "Dana Reed",
                overdueTaskCount: 2,
              },
            ],
          },
        }),
      ),
    );

    expect(attention).toMatchObject({
      kind: "overdue",
      headline: "Dana has 2 overdue tasks",
      actionLabel: "View overdue",
    });
  });

  test("picks the largest overdue pile", () => {
    const attention = teamMomentumAttention(
      rowsWith([
        { name: "Ann Lee", overdueTaskCount: 1 },
        { name: "Bo Diaz", overdueTaskCount: 5 },
      ]),
    );

    expect(attention?.member.name).toBe("Bo Diaz");
  });

  test("falls back to a member who has never completed anything", () => {
    const base = summary();
    base.groups.strong = [];
    base.groups.building = [];
    base.groups.readyToRebuild = [];
    const attention = teamMomentumAttention(
      teamMomentumRoster(presentTeamMomentumSummary(base)),
    );

    expect(attention).toMatchObject({
      kind: "no_completions",
      actionLabel: "Assign a task",
    });
    // Never claims tasks are unassigned; the summary cannot know that.
    expect(attention?.headline).toBe("new hasn’t completed a task yet");
  });

  test("falls back to a lapsed streak, quoting the saved personal best", () => {
    const base = summary();
    base.groups.strong = [];
    base.groups.building = [];
    base.notEnoughActivity = { count: 0, members: [] };
    const attention = teamMomentumAttention(
      teamMomentumRoster(presentTeamMomentumSummary(base)),
    );

    expect(attention).toMatchObject({ kind: "stalled" });
    expect(attention?.detail).toBe("Their best of 4 is still saved");
  });

  test("says nothing when every member is on track", () => {
    expect(teamMomentumAttention(rowsWith([{ name: "Ann Lee" }]))).toBeNull();
  });
});
