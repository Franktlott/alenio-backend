import type { TeamMember } from "@/lib/types";
import type { MemberStatsPayload, MemberStatsRow, WorkplaceStandards } from "@/lib/workplace-standards";
import type { ActivityApiEvent } from "@/components/activity/types";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";

export type CoachingPriorityFilter =
  | "checkInDue"
  | "goalsMissing"
  | "overdueTasks"
  | "recognition";

export type CoachingPriorityCounts = {
  checkInDue: number;
  goalsMissing: number;
  overdueTasks: number;
  recognition: number;
};

export type NeedsAttentionItem = {
  member: TeamMember;
  stats?: MemberStatsRow;
  reason: string;
  severity: number;
};

export type RecentlyActiveItem = {
  member: TeamMember;
  stats?: MemberStatsRow;
  checkInLabel: string;
  daysSince: number | null;
};

function statsFor(
  memberStats: MemberStatsPayload["stats"] | undefined,
  userId: string,
): MemberStatsRow | undefined {
  return memberStats?.[userId];
}

export function memberHasCheckInDue(
  stats: MemberStatsRow | undefined,
  checkInRequired: boolean,
): boolean {
  if (!checkInRequired) return false;
  const status = stats?.standardsCompliance?.checkInStatus;
  return status === "due_soon" || status === "overdue";
}

export function memberHasGoalsMissing(
  stats: MemberStatsRow | undefined,
  goalsRequired: boolean,
): boolean {
  if (!goalsRequired) return false;
  return stats?.standardsCompliance?.goalsStatus === "missing_goals";
}

export function memberHasOverdueTasks(stats: MemberStatsRow | undefined): boolean {
  return (stats?.overdueTasks ?? 0) > 0;
}

export function countCoachingPriorities(opts: {
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">;
  recognitionCount?: number;
}): CoachingPriorityCounts {
  const { members, memberStats, standards, recognitionCount = 0 } = opts;
  let checkInDue = 0;
  let goalsMissing = 0;
  let overdueTasks = 0;

  for (const member of members) {
    if (member.role === "owner") continue;
    const stats = statsFor(memberStats, member.userId);
    if (memberHasCheckInDue(stats, standards.checkInRequired)) checkInDue += 1;
    if (memberHasGoalsMissing(stats, standards.goalsRequired)) goalsMissing += 1;
    if (memberHasOverdueTasks(stats)) overdueTasks += 1;
  }

  return {
    checkInDue,
    goalsMissing,
    overdueTasks,
    recognition: recognitionCount,
  };
}

export function countRecentCelebrations(
  events: ActivityApiEvent[] | undefined,
  withinDays = 14,
): number {
  if (!events?.length) return 0;
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  return events.filter((event) => {
    if (event.type !== "celebration") return false;
    const created = new Date(event.createdAt).getTime();
    return Number.isFinite(created) && created >= cutoff;
  }).length;
}

export function countRecentlyRecognizedMembers(
  events: ActivityApiEvent[] | undefined,
  eligibleUserIds: string[],
  withinDays = 14,
): number {
  if (!events?.length || eligibleUserIds.length === 0) return 0;
  const eligible = new Set(eligibleUserIds);
  const recognized = new Set<string>();
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;

  for (const event of events) {
    if (event.type !== "celebration") continue;
    const created = new Date(event.createdAt).getTime();
    if (!Number.isFinite(created) || created < cutoff) continue;
    const targetUserId = event.metadata?.targetUserId;
    if (targetUserId && eligible.has(targetUserId)) recognized.add(targetUserId);
  }
  return recognized.size;
}

/** Real health breakdown for the cockpit card (no fake week-over-week delta). */
export function computeTeamHealthBreakdown(opts: {
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  checkInPct: number | null;
  goalsPct: number | null;
  recognizedMemberCount: number;
}): {
  checkInPct: number | null;
  goalsPct: number | null;
  tasksPct: number | null;
  recognitionPct: number | null;
} {
  const { members, memberStats, checkInPct, goalsPct, recognizedMemberCount } = opts;
  const seen = new Set<string>();
  const managed = members.filter((member) => {
    if (member.role === "owner" || seen.has(member.userId)) return false;
    seen.add(member.userId);
    return true;
  });
  const n = managed.length;

  let openTasks = 0;
  let overdueTasks = 0;
  for (const member of managed) {
    const stats = statsFor(memberStats, member.userId);
    openTasks += stats?.activeTasks ?? 0;
    overdueTasks += stats?.overdueTasks ?? 0;
  }

  return {
    checkInPct,
    goalsPct,
    tasksPct:
      openTasks > 0
        ? Math.round(((openTasks - Math.min(openTasks, overdueTasks)) / openTasks) * 100)
        : 100,
    recognitionPct:
      n > 0 ? Math.min(100, Math.round((recognizedMemberCount / n) * 100)) : 100,
  };
}

function attentionReason(
  stats: MemberStatsRow | undefined,
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired"> = {
    checkInRequired: true,
    goalsRequired: true,
  },
): { reason: string; severity: number } | null {
  const compliance = stats?.standardsCompliance;
  const overdueTasks = stats?.overdueTasks ?? 0;
  const days = stats?.daysSinceLastOneOnOne;

  if (standards.checkInRequired && compliance?.checkInStatus === "overdue") {
    const dayPart =
      days == null ? "No check-in yet" : `Missed check-in • ${formatDaysSinceCheckIn(days)}`;
    return { reason: dayPart, severity: 100 + (days ?? 30) };
  }
  if (overdueTasks > 0) {
    return {
      reason: overdueTasks === 1 ? "1 task overdue" : `${overdueTasks} tasks overdue`,
      severity: 50 + overdueTasks,
    };
  }
  if (standards.checkInRequired && compliance?.checkInStatus === "due_soon") {
    return {
      reason: `Check-in due soon • ${formatDaysSinceCheckIn(days)}`,
      severity: 40,
    };
  }
  if (standards.goalsRequired && compliance?.goalsStatus === "missing_goals") {
    const missing = compliance.missingGoals;
    return {
      reason: missing > 0 ? `Needs ${missing} active goal${missing === 1 ? "" : "s"}` : "Needs active goals",
      severity: 30,
    };
  }
  return null;
}

/** Higher = needs attention first (for directory Status sort). */
export function memberAttentionSeverity(stats: MemberStatsRow | undefined): number {
  return attentionReason(stats)?.severity ?? 0;
}

export function buildNeedsAttention(opts: {
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  standards?: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">;
  limit?: number;
}): NeedsAttentionItem[] {
  const {
    members,
    memberStats,
    standards = { checkInRequired: true, goalsRequired: true },
    limit = 5,
  } = opts;
  const items: NeedsAttentionItem[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (member.role === "owner") continue;
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    const stats = statsFor(memberStats, member.userId);
    const hit = attentionReason(stats, standards);
    if (!hit) continue;
    items.push({ member, stats, reason: hit.reason, severity: hit.severity });
  }

  return items.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

export function buildRecentlyActive(opts: {
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  limit?: number;
}): RecentlyActiveItem[] {
  const { members, memberStats, limit = 8 } = opts;
  const seen = new Set<string>();

  const items: RecentlyActiveItem[] = [];
  for (const member of members) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);

    const stats = statsFor(memberStats, member.userId);
    const daysSince = stats?.daysSinceLastOneOnOne ?? null;
    const status = stats?.standardsCompliance?.checkInStatus;

    let checkInLabel = "Not started";
    if (status === "on_track") {
      if (daysSince === 0) checkInLabel = "Checked in · Today";
      else if (daysSince == null) checkInLabel = "Checked in · —";
      else checkInLabel = `Checked in · ${formatDaysSinceCheckIn(daysSince)}`;
    } else if (status === "due_soon") {
      checkInLabel = `Check-in due · ${formatDaysSinceCheckIn(daysSince)}`;
    } else if (status === "overdue") {
      checkInLabel =
        daysSince == null ? "Not started · —" : `Overdue · ${formatDaysSinceCheckIn(daysSince)}`;
    } else if (daysSince != null) {
      checkInLabel = `Last check-in · ${formatDaysSinceCheckIn(daysSince)}`;
    }

    items.push({ member, stats, checkInLabel, daysSince });
  }

  return items
    .sort((a, b) => {
      if (a.daysSince == null && b.daysSince == null) {
        return (a.member.user.name ?? "").localeCompare(b.member.user.name ?? "");
      }
      if (a.daysSince == null) return 1;
      if (b.daysSince == null) return -1;
      return a.daysSince - b.daysSince;
    })
    .slice(0, limit);
}

export function filterMembersByCoachingFilter(opts: {
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  filter: CoachingPriorityFilter;
  standards: Pick<WorkplaceStandards, "checkInRequired" | "goalsRequired">;
}): TeamMember[] {
  const { members, memberStats, filter, standards } = opts;
  if (filter === "recognition") return [];

  return members.filter((member) => {
    if (member.role === "owner" && filter !== "overdueTasks") {
      // Still allow owners in overdue if they have tasks; skip for check-in/goals coaching lists
    }
    const stats = statsFor(memberStats, member.userId);
    if (filter === "checkInDue") {
      if (member.role === "owner") return false;
      return memberHasCheckInDue(stats, standards.checkInRequired);
    }
    if (filter === "goalsMissing") {
      if (member.role === "owner") return false;
      return memberHasGoalsMissing(stats, standards.goalsRequired);
    }
    if (filter === "overdueTasks") {
      return memberHasOverdueTasks(stats);
    }
    return true;
  });
}

export function coachingFilterTitle(filter: CoachingPriorityFilter, count: number): string {
  switch (filter) {
    case "checkInDue":
      return `Missed check-ins (${count})`;
    case "goalsMissing":
      return `Goals due for review (${count})`;
    case "overdueTasks":
      return `Overdue tasks (${count})`;
    case "recognition":
      return `Recent recognition (${count})`;
    default:
      return "Team";
  }
}

export function coachingFilterSubtitle(filter: CoachingPriorityFilter): string {
  switch (filter) {
    case "checkInDue":
      return "Team members who haven't checked in";
    case "goalsMissing":
      return "Team members who need active goals";
    case "overdueTasks":
      return "Team members with overdue tasks";
    case "recognition":
      return "Recent celebrations on this workplace";
    default:
      return "";
  }
}

export function coachingFilterShortLabel(filter: CoachingPriorityFilter): string {
  switch (filter) {
    case "checkInDue":
      return "Missed check-ins";
    case "goalsMissing":
      return "Goals due for review";
    case "overdueTasks":
      return "Overdue tasks";
    case "recognition":
      return "Recent recognition";
    default:
      return "Team";
  }
}

export function timeOfDayGreeting(now = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
