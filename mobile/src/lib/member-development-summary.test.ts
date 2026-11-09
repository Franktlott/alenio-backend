import { describe, expect, test } from "bun:test";
import {
  checkInsWithinGuidance,
  nextCheckInSummary,
  summarizeMemberDevelopment,
} from "./member-development-summary";
import type { PlannedOneOnOneEvent } from "./plan-one-on-one";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  type WorkplaceStandards,
} from "./workplace-standards";

const now = new Date("2026-09-08T12:00:00.000Z");

const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("summarizeMemberDevelopment", () => {
  test("is not started with no goals and no check-ins", () => {
    const summary = summarizeMemberDevelopment({ goals: [], checkIns: [], now });
    expect(summary.level).toBe("getting_started");
    expect(summary.label).toBe("Not started");
    expect(summary.detail).toBe(
      "Add a goal or run a check-in to start tracking growth.",
    );
    expect(summary.checkInDetail).toBe(summary.detail);
  });

  test("is on track with an active goal and a recent check-in", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "active" }, { status: "closed" }],
      checkIns: [{ status: "published", publishedAt: daysAgo(12) }],
      now,
    });
    expect(summary.level).toBe("on_track");
    expect(summary.label).toBe("On track");
    expect(summary.detail).toBe("1 active goal · last check-in 12 days ago");
    expect(summary.checkInDetail).toBe("Last check-in 12 days ago");
  });

  test("needs attention when the last check-in has gone stale", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "active" }],
      checkIns: [{ status: "published", publishedAt: daysAgo(60) }],
      now,
    });
    expect(summary.level).toBe("needs_attention");
    expect(summary.daysSinceLastCheckIn).toBe(60);
  });

  test("needs attention when check-ins happen but no goal is active", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "closed" }],
      checkIns: [{ status: "published", publishedAt: daysAgo(3) }],
      now,
    });
    expect(summary.level).toBe("needs_attention");
    expect(summary.detail).toBe("No active goals · last check-in 3 days ago");
  });

  test("ignores drafts and falls back to createdAt for published check-ins", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "active" }],
      checkIns: [
        { status: "draft", createdAt: daysAgo(1) },
        { status: "published", createdAt: daysAgo(9) },
      ],
      now,
    });
    expect(summary.publishedCheckInCount).toBe(1);
    expect(summary.daysSinceLastCheckIn).toBe(9);
  });

  test("uses the newest check-in and says so when it is today", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "active" }, { status: "active" }],
      checkIns: [
        { status: "published", publishedAt: daysAgo(30) },
        { status: "published", publishedAt: daysAgo(0) },
      ],
      now,
    });
    expect(summary.detail).toBe("2 active goals · checked in today");
    expect(summary.checkInDetail).toBe("Checked in today");
  });

  test("survives missing and unparsable dates", () => {
    const summary = summarizeMemberDevelopment({
      goals: [{ status: "active" }],
      checkIns: [{ status: "published", publishedAt: "not-a-date" }],
      now,
    });
    expect(summary.daysSinceLastCheckIn).toBeNull();
    expect(summary.level).toBe("needs_attention");
    expect(summary.detail).toBe("1 active goal · no check-ins yet");
  });
});

describe("checkInsWithinGuidance", () => {
  const standards = (over: Partial<WorkplaceStandards> = {}): WorkplaceStandards => ({
    ...DEFAULT_WORKPLACE_STANDARDS,
    ...over,
  });

  test("counts published check-ins inside the cadence window", () => {
    const summary = checkInsWithinGuidance({
      checkIns: [
        { status: "published", publishedAt: daysAgo(2) },
        { status: "published", publishedAt: daysAgo(20) },
        { status: "published", publishedAt: daysAgo(40) },
        { status: "draft", publishedAt: daysAgo(1) },
      ],
      standards: standards({ checkInFrequencyValue: 30, checkInFrequencyUnit: "days" }),
      now,
    });
    expect(summary).toMatchObject({
      count: 2,
      windowDays: 30,
      windowLabel: "30d",
      required: true,
      behind: false,
    });
  });

  test("converts weeks and months to days and adds the grace period", () => {
    expect(
      checkInsWithinGuidance({
        checkIns: [],
        standards: standards({
          checkInFrequencyValue: 2,
          checkInFrequencyUnit: "weeks",
        }),
        now,
      }),
    ).toMatchObject({ windowDays: 14, windowLabel: "2w" });
    expect(
      checkInsWithinGuidance({
        checkIns: [],
        standards: standards({
          checkInFrequencyValue: 1,
          checkInFrequencyUnit: "months",
          checkInGracePeriodDays: 5,
        }),
        now,
      }),
    ).toMatchObject({ windowDays: 35, windowLabel: "1mo" });
  });

  test("counts a check-in that the grace period keeps in range", () => {
    expect(
      checkInsWithinGuidance({
        checkIns: [{ status: "published", publishedAt: daysAgo(33) }],
        standards: standards({
          checkInFrequencyValue: 30,
          checkInFrequencyUnit: "days",
          checkInGracePeriodDays: 5,
        }),
        now,
      }).count,
    ).toBe(1);
  });

  test("is only behind when check-ins are required", () => {
    expect(
      checkInsWithinGuidance({ checkIns: [], standards: standards(), now }).behind,
    ).toBe(true);
    expect(
      checkInsWithinGuidance({
        checkIns: [],
        standards: standards({ checkInRequired: false }),
        now,
      }).behind,
    ).toBe(false);
  });
});

describe("nextCheckInSummary", () => {
  const event = (
    id: string,
    startDate: string,
    memberUserId = "member-1",
  ): PlannedOneOnOneEvent => ({
    id,
    title: "Development Check-in",
    startDate,
    isOneOnOne: true,
    oneOnOneMemberUserId: memberUserId,
  });

  const at = (iso: string) => new Date(iso);

  test("says nothing is booked when there are no events", () => {
    expect(
      nextCheckInSummary({ events: [], memberUserId: "member-1", now }),
    ).toEqual({ scheduled: false, label: "No check-in scheduled" });
  });

  test("uses the soonest upcoming event and counts days out", () => {
    expect(
      nextCheckInSummary({
        events: [
          event("late", "2026-09-30T15:00:00.000Z"),
          event("soon", "2026-09-18T15:00:00.000Z"),
        ],
        memberUserId: "member-1",
        now,
      }).label,
    ).toBe("Next check-in Sep 18 · in 10 days");
  });

  test("phrases today and tomorrow in words", () => {
    expect(
      nextCheckInSummary({
        events: [event("a", "2026-09-08T23:00:00.000Z")],
        memberUserId: "member-1",
        now: at("2026-09-08T12:00:00.000Z"),
      }).label,
    ).toContain("today");
    expect(
      nextCheckInSummary({
        events: [event("a", "2026-09-09T14:00:00.000Z")],
        memberUserId: "member-1",
        now: at("2026-09-08T12:00:00.000Z"),
      }).label,
    ).toContain("tomorrow");
  });

  test("ignores past events and other members' check-ins", () => {
    expect(
      nextCheckInSummary({
        events: [
          event("past", "2026-09-01T15:00:00.000Z"),
          event("other", "2026-09-20T15:00:00.000Z", "member-2"),
        ],
        memberUserId: "member-1",
        now,
      }).scheduled,
    ).toBe(false);
  });
});
