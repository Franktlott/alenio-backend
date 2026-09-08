import { describe, expect, test } from "bun:test";
import { projectMomentum, type MomentumOutcome } from "./momentum-projection";

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const outcome = (day: number, onTime: boolean, id = String(day)): MomentumOutcome => ({
  id,
  completedAt: at(day),
  onTime,
});

describe("projectMomentum", () => {
  test("projects the newest on-time run and maximum historical run", () => {
    const projection = projectMomentum([
      outcome(1, true),
      outcome(2, true),
      outcome(3, false),
      outcome(4, true),
      outcome(5, true),
      outcome(6, true),
      outcome(7, false),
      outcome(8, true),
      outcome(9, true),
    ]);

    expect(projection).toEqual({
      currentStreak: 2,
      personalBestStreak: 3,
      momentumRunStartedAt: at(8),
      momentumLastQualifiedAt: at(9),
    });
  });

  test("a newest late completion breaks current streak but preserves latest qualifying metadata", () => {
    expect(projectMomentum([outcome(1, true), outcome(20, true), outcome(27, false)])).toEqual({
      currentStreak: 0,
      personalBestStreak: 2,
      momentumRunStartedAt: null,
      momentumLastQualifiedAt: at(20),
    });
  });

  test("elapsed time does not break a streak", () => {
    const projection = projectMomentum([
      { id: "old", completedAt: new Date("2024-01-01T00:00:00.000Z"), onTime: true },
      { id: "new", completedAt: new Date("2026-08-27T00:00:00.000Z"), onTime: true },
    ]);

    expect(projection.currentStreak).toBe(2);
    expect(projection.personalBestStreak).toBe(2);
  });

  test("recomputes personal best when recalled evidence is removed", () => {
    const history = [
      outcome(1, true),
      outcome(2, true),
      outcome(3, true),
      outcome(4, false),
      outcome(5, true),
    ];

    expect(projectMomentum(history).personalBestStreak).toBe(3);
    expect(projectMomentum(history.filter((item) => item.id !== "2")).personalBestStreak).toBe(2);
  });

  test("returns an empty projection without evidence", () => {
    expect(projectMomentum([])).toEqual({
      currentStreak: 0,
      personalBestStreak: 0,
      momentumRunStartedAt: null,
      momentumLastQualifiedAt: null,
    });
  });
});
