import { describe, expect, test } from "bun:test";
import { utcMondayStart, weeklyRotationIndex } from "./home-insight-week";

const CARD_COUNT = 12;

describe("weekly Home insight rotation", () => {
  test("keeps the same card throughout a UTC Monday-based week", () => {
    const monday = new Date("2026-08-24T00:00:00.000Z");
    const sunday = new Date("2026-08-30T23:59:59.999Z");

    expect(weeklyRotationIndex(monday, CARD_COUNT)).toBe(
      weeklyRotationIndex(sunday, CARD_COUNT),
    );
    expect(weeklyRotationIndex(monday, CARD_COUNT)).toBe(0);
  });

  test("moves to the next card at Monday midnight UTC", () => {
    const before = new Date("2026-08-30T23:59:59.999Z");
    const after = new Date("2026-08-31T00:00:00.000Z");

    expect(weeklyRotationIndex(after, CARD_COUNT)).toBe(
      (weeklyRotationIndex(before, CARD_COUNT) + 1) % CARD_COUNT,
    );
  });

  test("handles a week spanning a calendar-year boundary", () => {
    const endOfYear = new Date("2026-12-31T12:00:00.000Z");
    const startOfYear = new Date("2027-01-01T12:00:00.000Z");

    expect(utcMondayStart(endOfYear)).toBe(utcMondayStart(startOfYear));
    expect(weeklyRotationIndex(endOfYear, CARD_COUNT)).toBe(
      weeklyRotationIndex(startOfYear, CARD_COUNT),
    );
  });

  test("wraps after all twelve curated cards", () => {
    const first = new Date("2026-08-24T12:00:00.000Z");
    const wrapped = new Date(
      first.getTime() + CARD_COUNT * 7 * 24 * 60 * 60 * 1000,
    );

    expect(weeklyRotationIndex(wrapped, CARD_COUNT)).toBe(
      weeklyRotationIndex(first, CARD_COUNT),
    );
  });
});
