/**
 * Rolls a member's goals and check-ins into the one-line status shown at the top
 * of their Development tab. Deliberately derived from data the tab already has,
 * so the headline can never disagree with the sections underneath it.
 */

import {
  isUpcomingOneOnOneForMember,
  type PlannedOneOnOneEvent,
} from "@/lib/plan-one-on-one";
import {
  frequencyToDays,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";

export type MemberDevelopmentLevel =
  | "on_track"
  | "needs_attention"
  | "getting_started";

export type MemberDevelopmentSummary = {
  level: MemberDevelopmentLevel;
  /** Headline, e.g. "On track". */
  label: string;
  /** Supporting line, e.g. "1 active goal · last check-in 12 days ago". */
  detail: string;
  /** Just the check-in half of the detail, for layouts that show goals separately. */
  checkInDetail: string;
  activeGoalCount: number;
  publishedCheckInCount: number;
  daysSinceLastCheckIn: number | null;
};

type GoalInput = { status?: string | null };

type CheckInInput = {
  status?: "draft" | "published" | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

/** A check-in older than this stops counting as recent contact. */
export const CHECK_IN_STALE_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

function checkInDate(checkIn: CheckInInput): number | null {
  const raw = checkIn.publishedAt ?? checkIn.createdAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export type GuidanceCheckInSummary = {
  /** Published check-ins inside the current guidance window. */
  count: number;
  /** Cadence plus grace, in days. */
  windowDays: number;
  /** Compact cadence label for a stat tile, e.g. "30d", "2w", "1mo". */
  windowLabel: string;
  required: boolean;
  /** True when the cadence expects a check-in and none landed in the window. */
  behind: boolean;
};

/**
 * Counts the check-ins that land inside the workspace's own check-in cadence,
 * so "on cadence" is measured against workplace guidance rather than a
 * hard-coded window.
 */
export function checkInsWithinGuidance({
  checkIns,
  standards,
  now = new Date(),
}: {
  checkIns: readonly CheckInInput[];
  standards: WorkplaceStandards;
  now?: Date;
}): GuidanceCheckInSummary {
  const cadenceDays = Math.max(
    1,
    frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit),
  );
  const windowDays = cadenceDays + Math.max(0, standards.checkInGracePeriodDays);
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const count = checkIns.filter((checkIn) => {
    if (checkIn.status === "draft") return false;
    const time = checkInDate(checkIn);
    return time != null && time >= cutoff;
  }).length;

  /** Label the stated cadence, not cadence + grace, so it matches settings. */
  const unitSuffix =
    standards.checkInFrequencyUnit === "weeks"
      ? "w"
      : standards.checkInFrequencyUnit === "months"
        ? "mo"
        : "d";

  return {
    count,
    windowDays,
    windowLabel: `${Math.max(1, standards.checkInFrequencyValue)}${unitSuffix}`,
    required: standards.checkInRequired,
    behind: standards.checkInRequired && count === 0,
  };
}

export type NextCheckInSummary = {
  scheduled: boolean;
  /** e.g. "Next check-in Sep 18 · in 10 days" or "No check-in scheduled". */
  label: string;
};

/** Describes the soonest upcoming check-in for the member, if any is booked. */
export function nextCheckInSummary({
  events,
  memberUserId,
  now = new Date(),
}: {
  events: readonly PlannedOneOnOneEvent[];
  memberUserId: string;
  now?: Date;
}): NextCheckInSummary {
  const upcoming = events
    .filter((event) => isUpcomingOneOnOneForMember(event, memberUserId, now.getTime()))
    .map((event) => new Date(event.startDate).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);

  const soonest = upcoming[0];
  if (soonest == null) return { scheduled: false, label: "No check-in scheduled" };

  const date = new Date(soonest);
  const when = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfEvent = new Date(date);
  startOfEvent.setHours(0, 0, 0, 0);
  const days = Math.round(
    (startOfEvent.getTime() - startOfToday.getTime()) / DAY_MS,
  );

  const relative =
    days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${plural(days, "day")}`;
  return {
    scheduled: true,
    label:
      days <= 1
        ? `Next check-in ${relative}, ${when}`
        : `Next check-in ${when} · ${relative}`,
  };
}

export function summarizeMemberDevelopment({
  goals,
  checkIns,
  now = new Date(),
}: {
  goals: readonly GoalInput[];
  checkIns: readonly CheckInInput[];
  now?: Date;
}): MemberDevelopmentSummary {
  const activeGoalCount = goals.filter((goal) => goal.status === "active").length;
  const published = checkIns.filter((checkIn) => checkIn.status !== "draft");
  const latest = published.reduce<number | null>((newest, checkIn) => {
    const time = checkInDate(checkIn);
    if (time == null) return newest;
    return newest == null || time > newest ? time : newest;
  }, null);
  const daysSinceLastCheckIn =
    latest == null
      ? null
      : Math.max(0, Math.floor((now.getTime() - latest) / DAY_MS));

  const goalDetail =
    activeGoalCount > 0 ? plural(activeGoalCount, "active goal") : "No active goals";
  const checkInDetail =
    daysSinceLastCheckIn == null
      ? "no check-ins yet"
      : daysSinceLastCheckIn === 0
        ? "checked in today"
        : `last check-in ${plural(daysSinceLastCheckIn, "day")} ago`;
  const detail = `${goalDetail} · ${checkInDetail}`;

  if (activeGoalCount === 0 && published.length === 0) {
    return {
      level: "getting_started",
      label: "Not started",
      detail: "Add a goal or run a check-in to start tracking growth.",
      checkInDetail: "Add a goal or run a check-in to start tracking growth.",
      activeGoalCount,
      publishedCheckInCount: published.length,
      daysSinceLastCheckIn,
    };
  }

  const staleCheckIn =
    daysSinceLastCheckIn == null || daysSinceLastCheckIn > CHECK_IN_STALE_DAYS;
  const level: MemberDevelopmentLevel =
    activeGoalCount > 0 && !staleCheckIn ? "on_track" : "needs_attention";

  return {
    level,
    label: level === "on_track" ? "On track" : "Needs attention",
    detail,
    checkInDetail:
      checkInDetail.charAt(0).toUpperCase() + checkInDetail.slice(1),
    activeGoalCount,
    publishedCheckInCount: published.length,
    daysSinceLastCheckIn,
  };
}
