import { describe, expect, test } from "bun:test";
import {
  memberStarPath,
  memberStars,
  momentumTaskTitle,
  teamMomentumAccessState,
  teamStarsRoster,
  type TeamMomentumLeaderSummary,
  type TeamMomentumMemberSummary,
} from "@/lib/team-momentum";

function member(
  userId: string,
  stars: number,
): TeamMomentumMemberSummary {
  return {
    teamMemberId: `membership-${userId}`,
    userId,
    name: userId,
    email: `${userId}@example.com`,
    image: null,
    role: "member",
    currentStreak: stars,
    currentStars: stars,
    personalBestStreak: Math.max(stars, 1),
    personalBestStars: Math.max(stars, 1),
    nextMilestone: stars < 5 ? 5 : stars < 10 ? 10 : 15,
    remainingToMilestone: stars < 5 ? 5 - stars : stars < 10 ? 10 - stars : 15 - stars,
    needsNudge: stars === 0,
    momentumRunStartedAt: "2026-08-01T12:00:00.000Z",
    momentumLastQualifiedAt: stars > 0 ? "2026-08-26T12:00:00.000Z" : null,
    completedThisMonth: stars,
    overdueTaskCount: 0,
  };
}

function summary(roster: TeamMomentumMemberSummary[]): TeamMomentumLeaderSummary {
  return {
    teamId: "team-1",
    generatedAt: "2026-08-27T12:00:00.000Z",
    activeWindowDays: 30,
    activeCount: roster.filter((row) => memberStars(row) > 0).length,
    eligibleCount: roster.length,
    roster,
    needsNudgeCount: roster.filter((row) => row.needsNudge).length,
    groups: { strong: [], building: [], readyToRebuild: [] },
    notEnoughActivity: {
      count: roster.filter((row) => memberStars(row) === 0).length,
      members: roster
        .filter((row) => memberStars(row) === 0)
        .map((row) => ({ ...row, reason: "no_qualifying_completions" as const })),
    },
  };
}

describe("Stars presentation", () => {
  test("prefers API roster order for coaching", () => {
    const rows = teamStarsRoster(
      summary([member("zero", 0), member("few", 2), member("more", 7)]),
    );
    expect(rows.map((row) => row.userId)).toEqual(["zero", "few", "more"]);
  });

  test("computes the hollow-to-filled segment", () => {
    expect(memberStarPath(member("alex", 7))).toMatchObject({
      currentStars: 7,
      nextMilestone: 10,
      filledInSegment: 2,
      segmentSize: 5,
      remainingToMilestone: 3,
    });
  });

  test("maps access codes for plan and leader gates", () => {
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
  });

  test("momentumTaskTitle respects privacy and deleted sources", () => {
    expect(momentumTaskTitle({ title: "Secret", incognito: true })).toBe("Private task");
    expect(momentumTaskTitle({ title: "Gone", incognito: false }, false)).toBe("Gone");
    expect(momentumTaskTitle({ title: null, incognito: false }, false)).toBe("Deleted task");
  });
});
