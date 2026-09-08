import { describe, expect, test } from "bun:test";
import {
  planMomentumProjectionRepairs,
  type StoredMomentumProjection,
} from "./momentum-repair";

const emptyMember = (
  overrides: Partial<StoredMomentumProjection> = {},
): StoredMomentumProjection => ({
  teamMemberId: "member-1",
  teamId: "team-1",
  userId: "user-1",
  currentStreak: 0,
  personalBestStreak: 0,
  momentumRunStartedAt: null,
  momentumLastQualifiedAt: null,
  personalBestCelebrated: false,
  ...overrides,
});

describe("planMomentumProjectionRepairs", () => {
  test("resets unsupported legacy projections without inferring evidence", () => {
    const repairs = planMomentumProjectionRepairs([
      emptyMember({
        currentStreak: 8,
        personalBestStreak: 12,
        momentumRunStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        momentumLastQualifiedAt: new Date("2026-01-08T00:00:00.000Z"),
        personalBestCelebrated: true,
      }),
    ], []);

    expect(repairs).toHaveLength(1);
    expect(repairs[0]!.after).toEqual({
      currentStreak: 0,
      personalBestStreak: 0,
      momentumRunStartedAt: null,
      momentumLastQualifiedAt: null,
      personalBestCelebrated: false,
    });
  });

  test("recomputes drift from non-revoked canonical credits supplied by the caller", () => {
    const older = new Date("2026-08-20T12:00:00.000Z");
    const newer = new Date("2026-08-21T12:00:00.000Z");
    const repairs = planMomentumProjectionRepairs(
      [emptyMember()],
      [
        { id: "credit-1", teamId: "team-1", creditedUserId: "user-1", completedAt: older, onTime: true },
        { id: "credit-2", teamId: "team-1", creditedUserId: "user-1", completedAt: newer, onTime: true },
      ],
    );

    expect(repairs[0]!.after).toEqual({
      currentStreak: 2,
      personalBestStreak: 2,
      momentumRunStartedAt: older,
      momentumLastQualifiedAt: newer,
      personalBestCelebrated: false,
    });
  });

  test("does not report projections already matching canonical evidence", () => {
    const completedAt = new Date("2026-08-21T12:00:00.000Z");
    expect(
      planMomentumProjectionRepairs(
        [
          emptyMember({
            currentStreak: 1,
            personalBestStreak: 1,
            momentumRunStartedAt: completedAt,
            momentumLastQualifiedAt: completedAt,
          }),
        ],
        [
          {
            id: "credit-1",
            teamId: "team-1",
            creditedUserId: "user-1",
            completedAt,
            onTime: true,
          },
        ],
      ),
    ).toEqual([]);
  });
});
