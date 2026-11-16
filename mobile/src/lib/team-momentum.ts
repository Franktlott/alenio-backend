import {
  nextStarsMilestone,
  starsMilestoneSegment,
} from "@/lib/stars";

export type TeamMomentumBand = "strong" | "building" | "ready_to_rebuild";
export type TeamMomentumNotEnoughActivityReason = "no_qualifying_completions";

export type TeamMomentumMemberSummary = {
  teamMemberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  currentStreak: number;
  currentStars?: number;
  personalBestStreak: number;
  personalBestStars?: number;
  nextMilestone?: number;
  remainingToMilestone?: number;
  needsNudge?: boolean;
  momentumRunStartedAt: string | null;
  momentumLastQualifiedAt: string | null;
  completedThisMonth: number;
  overdueTaskCount: number;
  latestLateTaskTitle?: string | null;
  latestLateTaskIncognito?: boolean;
};

export type TeamMomentumWeekPoint = {
  start: string;
  onTime: number;
  total: number;
};

export type TeamMomentumDashboardStats = {
  onTimeCompletions: number;
  previousOnTimeCompletions: number;
  onTimeChangePercent: number | null;
  weeks: TeamMomentumWeekPoint[];
  taskStatus: {
    onTime: number;
    dueSoon: number;
    overdue: number;
  };
};

export type TeamMomentumGroupedMember = TeamMomentumMemberSummary & {
  band: TeamMomentumBand;
};

export type TeamMomentumNotEnoughActivityMember = TeamMomentumMemberSummary & {
  reason: TeamMomentumNotEnoughActivityReason;
};

export type TeamMomentumLeaderSummary = {
  teamId: string;
  generatedAt: string;
  activeWindowDays: 30;
  activeCount: number;
  eligibleCount: number;
  roster?: TeamMomentumMemberSummary[];
  needsNudgeCount?: number;
  groups: {
    strong: TeamMomentumGroupedMember[];
    building: TeamMomentumGroupedMember[];
    readyToRebuild: TeamMomentumGroupedMember[];
  };
  notEnoughActivity: {
    count: number;
    members: TeamMomentumNotEnoughActivityMember[];
  };
  dashboard?: TeamMomentumDashboardStats;
  coachingVisible?: boolean;
};

export type TeamMomentumCompletionEvidence = {
  creditId: string;
  sourceTaskId: string;
  sourceTaskAvailable: boolean;
  title: string | null;
  incognito: boolean;
  dueAt: string;
  completedAt: string;
  onTime: boolean;
};

export type TeamMomentumStreakBreakingLateCompletion =
  TeamMomentumCompletionEvidence & {
    onTime: false;
    streakBeforeBreak: number;
  };

export type TeamMomentumTaskSummary = {
  id: string;
  title: string | null;
  incognito: boolean;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  isJoint: boolean;
};

export type TeamMomentumActiveTaskSummary = TeamMomentumTaskSummary & {
  dueAt: string | null;
};

export type TeamMomentumOverdueTaskSummary = TeamMomentumTaskSummary & {
  dueAt: string;
  overdueSince: string;
};

export type StarsJourneyStatus = "completed" | "active" | "locked";

export type StarsJourneyStep = {
  id: string;
  threshold: number;
  title: string;
  iconKey: "star" | "bolt" | "mountain" | "trophy";
  status: StarsJourneyStatus;
  progressCurrent: number;
  progressTarget: number;
};

export type TeamMomentumMemberDetail = {
  teamId: string;
  generatedAt: string;
  activeWindowDays: 30;
  member: TeamMomentumMemberSummary;
  active: boolean;
  band: TeamMomentumBand | null;
  notEnoughActivityReason: TeamMomentumNotEnoughActivityReason | null;
  nextMilestone?: number;
  remainingToMilestone?: number;
  filledInSegment?: number;
  segmentSize?: number;
  dayStreak?: number;
  journey?: StarsJourneyStep[];
  currentRun: {
    startedAt: string | null;
    lastQualifiedAt: string | null;
    totalCount: number;
    returnedCount: number;
    truncated: boolean;
    completions: TeamMomentumCompletionEvidence[];
  };
  latestStreakBreakingLateCompletion: TeamMomentumStreakBreakingLateCompletion | null;
  activeTasks: TeamMomentumActiveTaskSummary[];
  overdueTasks: TeamMomentumOverdueTaskSummary[];
};

export type TeamMomentumAccessState =
  | "leader_required"
  | "plan_required"
  | "unavailable"
  | null;

export const teamMomentumSummaryQueryKey = (teamId: string) =>
  ["team-stars", teamId, "summary"] as const;

export const teamMomentumMemberDetailQueryKey = (
  teamId: string,
  memberUserId: string,
) => ["team-stars", teamId, "member", memberUserId] as const;

export function teamMomentumAccessState(
  error: unknown,
): TeamMomentumAccessState {
  if (!error) return null;
  const apiError = error as {
    status?: number;
    body?: { error?: { code?: string } } | null;
  };
  const code = apiError.body?.error?.code;
  if (apiError.status === 403 && code === "TEAM_MOMENTUM_LEADER_REQUIRED") {
    return "leader_required";
  }
  if (apiError.status === 403 && code === "TEAM_MOMENTUM_PLAN_REQUIRED") {
    return "plan_required";
  }
  return "unavailable";
}

export function memberStars(member: TeamMomentumMemberSummary): number {
  return member.currentStars ?? member.currentStreak ?? 0;
}

export function memberStarPath(member: TeamMomentumMemberSummary) {
  const stars = memberStars(member);
  const segment = starsMilestoneSegment(stars);
  return {
    ...segment,
    nextMilestone: member.nextMilestone ?? segment.nextMilestone,
    remainingToMilestone:
      member.remainingToMilestone ?? segment.remainingToMilestone,
  };
}

/** Prefer API roster; fall back to flattening legacy band groups. */
export function teamStarsRoster(
  summary: TeamMomentumLeaderSummary,
): TeamMomentumMemberSummary[] {
  if (summary.roster?.length) return summary.roster;
  return [
    ...summary.groups.strong,
    ...summary.groups.building,
    ...summary.groups.readyToRebuild,
    ...summary.notEnoughActivity.members,
  ].sort((left, right) => {
    const leftStars = memberStars(left);
    const rightStars = memberStars(right);
    const leftNudge = left.needsNudge ?? leftStars === 0;
    const rightNudge = right.needsNudge ?? rightStars === 0;
    if (leftNudge !== rightNudge) return leftNudge ? -1 : 1;
    if (leftStars !== rightStars) return leftStars - rightStars;
    return left.name.localeCompare(right.name);
  });
}

/** @deprecated Prefer teamStarsRoster */
export function presentTeamMomentumSummary(summary: TeamMomentumLeaderSummary) {
  const roster = teamStarsRoster(summary);
  return {
    activeCount: summary.activeCount,
    strong: [] as TeamMomentumGroupedMember[],
    building: [] as TeamMomentumGroupedMember[],
    readyToRebuild: [] as TeamMomentumGroupedMember[],
    notEnoughActivity: roster.filter((row) => memberStars(row) === 0),
    roster,
  };
}

export function teamMomentumRoster(
  presentation: ReturnType<typeof presentTeamMomentumSummary>,
) {
  return (presentation.roster ?? []).map((member) => ({
    member,
    state:
      memberStars(member) === 0
        ? ("not_enough_activity" as const)
        : ("building" as const),
  }));
}

export function effectiveTeamMomentumBand(): TeamMomentumBand | null {
  return null;
}

export const MOMENTUM_STRONG_STREAK = 3;

export function momentumTaskTitle(
  item: { title: string | null; incognito: boolean },
  sourceTaskAvailable = true,
): string {
  if (item.incognito) return "Private task";
  if (!sourceTaskAvailable) return item.title?.trim() || "Deleted task";
  return item.title?.trim() || "Untitled task";
}

export { nextStarsMilestone, starsMilestoneSegment };
