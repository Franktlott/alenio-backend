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
  personalBestStreak: number;
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
  groups: {
    strong: TeamMomentumGroupedMember[];
    building: TeamMomentumGroupedMember[];
    readyToRebuild: TeamMomentumGroupedMember[];
  };
  notEnoughActivity: {
    count: number;
    members: TeamMomentumNotEnoughActivityMember[];
  };
  /** Absent until the summary API that carries the chart is deployed. */
  dashboard?: TeamMomentumDashboardStats;
  /**
   * Absent on the summary from before members could open this page.
   * False hides overdue counts and the task that reset someone else's run.
   */
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

export type TeamMomentumMemberDetail = {
  teamId: string;
  generatedAt: string;
  activeWindowDays: 30;
  member: TeamMomentumMemberSummary;
  active: boolean;
  band: TeamMomentumBand | null;
  notEnoughActivityReason: TeamMomentumNotEnoughActivityReason | null;
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
  ["team-momentum", teamId, "summary"] as const;

export const teamMomentumMemberDetailQueryKey = (
  teamId: string,
  memberUserId: string,
) => ["team-momentum", teamId, "member", memberUserId] as const;

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

function isStaleRun(
  member: TeamMomentumMemberSummary,
  generatedAt: string,
  activeWindowDays: number,
): boolean {
  if (member.currentStreak <= 0) return true;
  if (!member.momentumLastQualifiedAt) return true;
  const generatedTime = new Date(generatedAt).getTime();
  const qualifiedTime = new Date(member.momentumLastQualifiedAt).getTime();
  if (!Number.isFinite(generatedTime) || !Number.isFinite(qualifiedTime))
    return true;
  return qualifiedTime < generatedTime - activeWindowDays * 24 * 60 * 60 * 1000;
}

export function effectiveTeamMomentumBand(
  member: TeamMomentumMemberSummary,
  serverBand: TeamMomentumBand | null,
  generatedAt: string,
  activeWindowDays: number,
): TeamMomentumBand | null {
  if (
    (serverBand === "strong" || serverBand === "building") &&
    isStaleRun(member, generatedAt, activeWindowDays)
  ) {
    return "ready_to_rebuild";
  }
  return serverBand;
}

export function presentTeamMomentumSummary(summary: TeamMomentumLeaderSummary) {
  const strong: TeamMomentumGroupedMember[] = [];
  const building: TeamMomentumGroupedMember[] = [];
  const readyToRebuild: TeamMomentumGroupedMember[] = [];
  const rows = [
    ...summary.groups.strong,
    ...summary.groups.building,
    ...summary.groups.readyToRebuild,
  ];

  for (const member of rows) {
    const band =
      effectiveTeamMomentumBand(
        member,
        member.band,
        summary.generatedAt,
        summary.activeWindowDays,
      ) ?? "ready_to_rebuild";
    const row = { ...member, band };
    if (band === "strong") strong.push(row);
    else if (band === "building") building.push(row);
    else readyToRebuild.push(row);
  }

  return {
    activeCount: strong.length + building.length,
    strong,
    building,
    readyToRebuild,
    notEnoughActivity: summary.notEnoughActivity.members,
  };
}

/** Consecutive on-time completions that earn the strong band. */
export const MOMENTUM_STRONG_STREAK = 3;

export type TeamMomentumRosterState =
  | "strong"
  | "building"
  | "ready_to_rebuild"
  | "not_enough_activity";

export type TeamMomentumRosterRow = {
  member: TeamMomentumGroupedMember | TeamMomentumNotEnoughActivityMember;
  state: TeamMomentumRosterState;
};

/**
 * One roster instead of four banded sections. Ordering runs best to weakest so
 * the list reads as a roster rather than a ranking of who is failing; whoever
 * actually needs the leader is raised by {@link teamMomentumAttention} instead.
 */
export function teamMomentumRoster(
  presentation: ReturnType<typeof presentTeamMomentumSummary>,
): TeamMomentumRosterRow[] {
  return [
    ...presentation.strong.map((member) => ({
      member,
      state: "strong" as const,
    })),
    ...presentation.building.map((member) => ({
      member,
      state: "building" as const,
    })),
    ...presentation.readyToRebuild.map((member) => ({
      member,
      state: "ready_to_rebuild" as const,
    })),
    ...presentation.notEnoughActivity.map((member) => ({
      member,
      state: "not_enough_activity" as const,
    })),
  ];
}

export type TeamMomentumAttentionKind = "overdue" | "no_completions" | "stalled";

export type TeamMomentumAttention = {
  member: TeamMomentumGroupedMember | TeamMomentumNotEnoughActivityMember;
  kind: TeamMomentumAttentionKind;
  headline: string;
  detail: string;
  actionLabel: string;
};

function firstName(member: TeamMomentumMemberSummary): string {
  const name = member.name?.trim();
  if (name) return name.split(/\s+/)[0]!;
  return member.email?.trim() || "This member";
}

/**
 * The single member worth acting on, most urgent first: work already late,
 * then nobody-has-started, then a streak that lapsed.
 *
 * The summary carries no count of open tasks, so nothing here claims a member
 * has none assigned — only that nothing has counted yet.
 */
export function teamMomentumAttention(
  rows: TeamMomentumRosterRow[],
): TeamMomentumAttention | null {
  const overdue = rows
    .filter((row) => row.member.overdueTaskCount > 0)
    .sort(
      (a, b) =>
        b.member.overdueTaskCount - a.member.overdueTaskCount ||
        firstName(a.member).localeCompare(firstName(b.member)),
    )[0];
  if (overdue) {
    const count = overdue.member.overdueTaskCount;
    return {
      member: overdue.member,
      kind: "overdue",
      headline: `${firstName(overdue.member)} has ${count} overdue ${
        count === 1 ? "task" : "tasks"
      }`,
      detail: "A late completion breaks a task streak",
      actionLabel: "View overdue",
    };
  }

  const unstarted = rows.find((row) => row.state === "not_enough_activity");
  if (unstarted) {
    return {
      member: unstarted.member,
      kind: "no_completions",
      headline: `${firstName(unstarted.member)} hasn’t completed a task yet`,
      detail: "Nothing has counted toward a task streak so far",
      actionLabel: "Assign a task",
    };
  }

  const stalled = rows.find((row) => row.state === "ready_to_rebuild");
  if (stalled) {
    return {
      member: stalled.member,
      kind: "stalled",
      headline: `${firstName(stalled.member)} lost their task streak`,
      detail: `Their best of ${stalled.member.personalBestStreak} is still saved`,
      actionLabel: "View details",
    };
  }

  return null;
}

export function momentumTaskTitle(
  item: { title: string | null; incognito: boolean },
  sourceTaskAvailable = true,
): string {
  if (item.incognito) return "Private task";
  if (!sourceTaskAvailable) return item.title?.trim() || "Deleted task";
  return item.title?.trim() || "Untitled task";
}
