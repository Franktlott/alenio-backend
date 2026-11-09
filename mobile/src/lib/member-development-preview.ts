import type {
  DevelopmentGoal,
  OneOnOneMeeting,
} from "@/lib/member-profile-api";
import { oneOnOneDisplayDateMs } from "@/lib/one-on-one-dates";
import type {
  MemberStatsRow,
  WorkplaceStandards,
} from "@/lib/workplace-standards";

export type MemberDevelopmentStatus = {
  level:
    | "on_track"
    | "due_soon"
    | "needs_attention"
    /** Nothing is being asked of this person, so there is nothing to pass. */
    | "not_required"
    | "unavailable";
  title: string;
  detail: string;
};

export function memberDevelopmentStatus(
  stats: MemberStatsRow | undefined,
  standards: WorkplaceStandards,
): MemberDevelopmentStatus {
  if (!stats) {
    return {
      level: "unavailable",
      title: "Status unavailable",
      detail: "Your development status will appear when data is available.",
    };
  }

  const compliance = stats.standardsCompliance;
  if ((standards.checkInRequired || standards.goalsRequired) && !compliance) {
    return {
      level: "unavailable",
      title: "Status unavailable",
      detail: "Workplace development standards are still loading.",
    };
  }
  // A standard can be switched off for the whole workspace or waived for one
  // person, and either way there is nothing to hold them to.
  const goalsRequired =
    standards.goalsRequired && compliance?.goalsStatus !== "not_required";
  const checkInRequired =
    standards.checkInRequired && compliance?.checkInStatus !== "not_required";

  const activeGoals = Math.max(0, stats.activeDevGoals ?? 0);
  const goalRequirement = goalsRequired
    ? `${activeGoals} of ${standards.minimumActiveGoals} active ${
        standards.minimumActiveGoals === 1 ? "goal" : "goals"
      }`
    : `${activeGoals} active ${activeGoals === 1 ? "goal" : "goals"}`;

  if (checkInRequired && compliance?.checkInStatus === "overdue") {
    return {
      level: "needs_attention",
      title: "Needs attention",
      detail: `Your check-in is overdue · ${goalRequirement}`,
    };
  }
  if (goalsRequired && compliance?.goalsStatus === "missing_goals") {
    const missing = Math.max(1, compliance.missingGoals);
    return {
      level: "needs_attention",
      title: "Needs attention",
      detail: `${missing} ${missing === 1 ? "goal needs" : "goals need"} attention · ${goalRequirement}`,
    };
  }
  if (checkInRequired && compliance?.checkInStatus === "due_soon") {
    return {
      level: "due_soon",
      title: "Due soon",
      detail: `Your next check-in is approaching · ${goalRequirement}`,
    };
  }
  const onTrackParts = [
    goalsRequired || activeGoals > 0 ? goalRequirement : null,
    checkInRequired ? "Check-ins are current" : null,
  ].filter(Boolean);

  // Passing a bar nobody set is not an achievement, so this stays out of the
  // green that means "measured and keeping up".
  if (!goalsRequired && !checkInRequired) {
    return {
      level: "not_required",
      title: "No standards required",
      detail:
        onTrackParts.join(" · ") ||
        "No development standards are currently required.",
    };
  }

  return {
    level: "on_track",
    title: "On track",
    detail: onTrackParts.join(" · "),
  };
}

export function recentMemberCheckIns(
  meetings: OneOnOneMeeting[],
): OneOnOneMeeting[] {
  return [...meetings]
    .sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a))
    .slice(0, 2);
}

export function activeMemberGoals(goals: DevelopmentGoal[]): DevelopmentGoal[] {
  return goals.filter((goal) => goal.status === "active");
}
