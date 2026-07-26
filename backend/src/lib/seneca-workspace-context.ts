import { prisma } from "../prisma";
import {
  buildDevelopmentGoalActivityAlerts,
  reconcileInactiveDevelopmentGoals,
} from "./development-goal-activity";
import {
  buildRuleBasedLastCheckInInsights,
  extractLastCheckInSource,
} from "./seneca-last-check-in-insights";
import { oneOnOnePublishedAt } from "./one-on-one-meeting-dates";
import {
  computeMemberStandardsCompliance,
  parseWorkplaceStandards,
  type MemberStandardsCompliance,
} from "./workplace-standards";

export type SenecaWorkspaceMemberRow = {
  userId: string;
  name: string;
  role: string;
  overdueTasks: number;
  activeTasks: number;
  completedTasksThisMonth: number;
  daysSinceLastOneOnOne: number | null;
  activeDevGoals: number;
  checkInStatus?: MemberStandardsCompliance["checkInStatus"];
  /** Clear risk label for Seneca — distinguishes never checked in from truly overdue. */
  checkInRisk?: "no_check_in_yet" | "overdue" | "due_soon" | "on_track" | "not_required";
  checkInActionText?: string;
  goalsStatus?: MemberStandardsCompliance["goalsStatus"];
};

export type SenecaMemberCheckInNeed = {
  name: string;
  reason: "no_check_in_yet" | "overdue" | "due_soon";
  daysSinceLastOneOnOne: number | null;
};

export type SenecaStaleDevelopmentGoal = {
  goalId: string;
  memberUserId: string;
  memberName: string;
  skill: string;
  daysSinceActivity: number;
  daysUntilInactive: number | null;
};

export type SenecaTeamHealthSummary = {
  checkInCompliancePct: number | null;
  developmentPlanCompliancePct: number | null;
  teamHealthPct: number | null;
};

export type SenecaUpcomingCalendarItem = {
  title: string;
  startDate: string;
  endDate: string | null;
  kind: "check_in" | "virtual_meeting" | "public_event" | "private_event";
  memberName: string | null;
  isVideoMeeting: boolean;
};

export type SenecaLastCheckInSummary = {
  memberName: string;
  date: string;
  daysAgo: number;
  templateTitle: string;
  highlights: string[];
  openFollowUpTitles: string[];
};

export type SenecaOpenTaskRow = {
  title: string;
  assigneeNames: string[];
  priority: string;
  status: string;
  dueDate: string | null;
  overdue: boolean;
};

export type SenecaActiveGoalDetail = {
  memberName: string;
  skill: string;
  recentNote: string | null;
};

export type SenecaRecentWin = {
  memberName: string | null;
  summary: string;
  createdAt: string;
};

export type SenecaWorkspaceContext = {
  teamName: string;
  managerName: string | null;
  members: SenecaWorkspaceMemberRow[];
  overdueTasks: Array<{ title: string; assigneeNames: string[]; dueDate: string | null }>;
  membersNeedingCheckIn: SenecaMemberCheckInNeed[];
  /** Count of published check-ins represented in lastCheckIns (0 = none ever for this roster snapshot). */
  publishedCheckInCount: number;
  activeDevelopmentGoalsCount: number;
  developmentGoalsNearingInactive: SenecaStaleDevelopmentGoal[];
  inactiveDevelopmentGoals: SenecaStaleDevelopmentGoal[];
  teamHealth: SenecaTeamHealthSummary;
  /** Team calendar items from now through the next 7 days (this workspace only). */
  upcomingCalendar: SenecaUpcomingCalendarItem[];
  /** Latest published check-in highlights per member (historical — not live status). */
  lastCheckIns: SenecaLastCheckInSummary[];
  /** Open Alenio tasks with priority and due dates (this workspace only). */
  openTasks: SenecaOpenTaskRow[];
  /** Active development goals with latest note (this workspace only). */
  activeGoalDetails: SenecaActiveGoalDetail[];
  /** Recent recognition / completion wins (this workspace only). */
  recentWins: SenecaRecentWin[];
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  if (role === "admin") return "Admin";
  return "Member";
}

function daysSinceCalendar(then: Date, now = new Date()): number {
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfThenUtc = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  return Math.max(0, Math.floor((startOfTodayUtc - startOfThenUtc) / 86_400_000));
}

function emptyTeamHealth(): SenecaTeamHealthSummary {
  return {
    checkInCompliancePct: null,
    developmentPlanCompliancePct: null,
    teamHealthPct: null,
  };
}

function truncateText(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function parseJsonRecord(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number>;
  } catch {
    return {};
  }
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function calendarKind(event: {
  isOneOnOne: boolean;
  isVideoMeeting: boolean;
  isHidden: boolean;
}): SenecaUpcomingCalendarItem["kind"] {
  if (event.isOneOnOne) return "check_in";
  if (event.isVideoMeeting) return "virtual_meeting";
  if (event.isHidden) return "private_event";
  return "public_event";
}

function priorityRank(priority: string): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  if (priority === "low") return 2;
  return 3;
}

/** Empty enrichment lists for lightweight / roster-only contexts. */
export function emptySenecaWorkspaceEnrichment(): Pick<
  SenecaWorkspaceContext,
  | "upcomingCalendar"
  | "lastCheckIns"
  | "openTasks"
  | "activeGoalDetails"
  | "recentWins"
  | "publishedCheckInCount"
> {
  return {
    upcomingCalendar: [],
    lastCheckIns: [],
    openTasks: [],
    activeGoalDetails: [],
    recentWins: [],
    publishedCheckInCount: 0,
  };
}

/**
 * Live team health for ONE workspace (`teamId` only).
 * Do not load other teams, org-wide aggregates, or cross-workspace data.
 * Every database query below MUST filter by this `teamId`.
 */
export async function buildSenecaWorkspaceContext(
  teamId: string,
  managerUserId: string,
): Promise<SenecaWorkspaceContext> {
  if (!teamId) {
    throw new Error("buildSenecaWorkspaceContext requires teamId");
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const winsSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [team, members, assignments, devGoals, lastMeetings, calendarEvents, recentActivities] =
    await Promise.all([
      prisma.team.findUnique({
        where: { id: teamId },
        select: { name: true, workplaceStandards: true },
      }),
      prisma.teamMember.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.taskAssignment.findMany({
        where: { task: { teamId } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
              completedAt: true,
              priority: true,
              archivedAt: true,
            },
          },
        },
      }),
      prisma.developmentGoal.findMany({
        where: { teamId, status: { not: "closed" } },
        select: {
          id: true,
          memberUserId: true,
          skill: true,
          status: true,
          createdAt: true,
          lastActivityAt: true,
          notes: { select: { createdAt: true, body: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      prisma.oneOnOneMeeting.findMany({
        where: { teamId, status: "published" },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          memberUserId: true,
          createdAt: true,
          publishedAt: true,
          status: true,
          templateId: true,
          templateTitle: true,
          templateFields: true,
          responses: true,
        },
        take: 120,
      }),
      prisma.calendarEvent.findMany({
        where: {
          teamId,
          approvalStatus: { not: "rejected" },
          startDate: { lte: weekEnd },
        },
        orderBy: { startDate: "asc" },
        select: {
          title: true,
          startDate: true,
          endDate: true,
          isHidden: true,
          isVideoMeeting: true,
          isOneOnOne: true,
          oneOnOneMemberUserId: true,
          createdById: true,
          approvalStatus: true,
        },
        take: 80,
      }),
      prisma.teamActivity.findMany({
        where: {
          teamId,
          createdAt: { gte: winsSince },
          type: { in: ["celebration", "task_completed"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          type: true,
          metadata: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
        take: 40,
      }),
    ]);

  const workplaceStandards = parseWorkplaceStandards(team?.workplaceStandards);
  const manager = members.find((m) => m.userId === managerUserId);
  const managerName = manager?.user.name ?? manager?.user.email ?? null;

  const memberNameByUserId = new Map(
    members.map((m) => [m.userId, m.user.name ?? m.user.email ?? "Team member"]),
  );
  const memberUserIds = new Set(members.map((m) => m.userId));

  const devGoalCountByUser = new Map<string, number>();
  const inactiveIds = await reconcileInactiveDevelopmentGoals(devGoals, async (ids) => {
    await prisma.developmentGoal.updateMany({
      where: { id: { in: ids }, teamId },
      data: { status: "inactive" },
    });
  });
  const devGoalsLive = devGoals.map((goal) =>
    inactiveIds.has(goal.id) ? { ...goal, status: "inactive" } : goal,
  );
  for (const goal of devGoalsLive) {
    if (goal.status !== "active") continue;
    if (!memberUserIds.has(goal.memberUserId)) continue;
    devGoalCountByUser.set(goal.memberUserId, (devGoalCountByUser.get(goal.memberUserId) ?? 0) + 1);
  }

  const goalAlerts = buildDevelopmentGoalActivityAlerts(devGoalsLive);
  const mapAlert = (alert: (typeof goalAlerts.nearingInactive)[number]): SenecaStaleDevelopmentGoal => ({
    goalId: alert.goalId,
    memberUserId: alert.memberUserId,
    memberName: memberNameByUserId.get(alert.memberUserId) ?? "Team member",
    skill: alert.skill,
    daysSinceActivity: alert.daysSinceActivity,
    daysUntilInactive: alert.daysUntilInactive,
  });

  const lastCheckInByUser = new Map<string, Date>();
  const latestMeetingByUser = new Map<string, (typeof lastMeetings)[number]>();
  const requiredTemplateId = workplaceStandards.requiredCheckInTemplateId;
  for (const meeting of lastMeetings) {
    if (!memberUserIds.has(meeting.memberUserId)) continue;
    if (!latestMeetingByUser.has(meeting.memberUserId)) {
      latestMeetingByUser.set(meeting.memberUserId, meeting);
    }
    if (requiredTemplateId && meeting.templateId !== requiredTemplateId) continue;
    if (!lastCheckInByUser.has(meeting.memberUserId)) {
      const publishedAt = oneOnOnePublishedAt(meeting);
      if (publishedAt) lastCheckInByUser.set(meeting.memberUserId, publishedAt);
    }
  }

  const latestMeetingIds = [...latestMeetingByUser.values()].map((meeting) => meeting.id);
  const followUpsByMeetingId = new Map<string, Array<{ title: string }>>();
  if (latestMeetingIds.length > 0) {
    const followUps = await prisma.task.findMany({
      where: {
        teamId,
        oneOnOneMeetingId: { in: latestMeetingIds },
        status: { not: "done" },
      },
      select: { title: true, oneOnOneMeetingId: true },
      take: 80,
    });
    for (const task of followUps) {
      if (!task.oneOnOneMeetingId) continue;
      const list = followUpsByMeetingId.get(task.oneOnOneMeetingId) ?? [];
      list.push({ title: task.title });
      followUpsByMeetingId.set(task.oneOnOneMeetingId, list);
    }
  }

  const lastCheckIns: SenecaLastCheckInSummary[] = [...latestMeetingByUser.entries()]
    .map(([memberUserId, meeting]) => {
      const fields = parseJsonArray<{ id: string; label: string; type: string }>(meeting.templateFields);
      const responses = parseJsonRecord(meeting.responses);
      const openFollowUps = followUpsByMeetingId.get(meeting.id) ?? [];
      const source = extractLastCheckInSource(meeting, fields, responses, openFollowUps, now);
      const highlights = buildRuleBasedLastCheckInInsights(source)
        .slice(1, 5)
        .map((line) => truncateText(line, 180));
      return {
        memberName: memberNameByUserId.get(memberUserId) ?? "Team member",
        date: source.date,
        daysAgo: source.daysAgo,
        templateTitle: source.templateTitle,
        highlights,
        openFollowUpTitles: source.openFollowUpTitles.slice(0, 5),
      };
    })
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .slice(0, 12);

  const statsByUser = new Map<
    string,
    { activeTasks: number; overdueTasks: number; completedTasksThisMonth: number }
  >();

  for (const assignment of assignments) {
    if (!memberUserIds.has(assignment.userId)) continue;
    const userId = assignment.userId;
    if (!statsByUser.has(userId)) {
      statsByUser.set(userId, { activeTasks: 0, overdueTasks: 0, completedTasksThisMonth: 0 });
    }
    const row = statsByUser.get(userId)!;
    const task = assignment.task;
    if (task.archivedAt) continue;
    if (task.status !== "done") {
      row.activeTasks++;
      if (task.dueDate && task.dueDate < now) row.overdueTasks++;
    } else if (task.completedAt && task.completedAt >= monthStart && task.completedAt <= monthEnd) {
      row.completedTasksThisMonth++;
    }
  }

  const complianceByUser = new Map<string, MemberStandardsCompliance>();
  const memberRows: SenecaWorkspaceMemberRow[] = members.map((member) => {
    const stats = statsByUser.get(member.userId) ?? {
      activeTasks: 0,
      overdueTasks: 0,
      completedTasksThisMonth: 0,
    };
    const lastCheckIn = lastCheckInByUser.get(member.userId);
    const daysSinceLastOneOnOne = lastCheckIn ? daysSinceCalendar(lastCheckIn, now) : null;
    const activeDevGoals = devGoalCountByUser.get(member.userId) ?? 0;
    const compliance = computeMemberStandardsCompliance(
      workplaceStandards,
      daysSinceLastOneOnOne,
      activeDevGoals,
    );
    complianceByUser.set(member.userId, compliance);

    return {
      userId: member.userId,
      name: member.user.name ?? member.user.email ?? "Team member",
      role: roleLabel(member.role),
      overdueTasks: stats.overdueTasks,
      activeTasks: stats.activeTasks,
      completedTasksThisMonth: stats.completedTasksThisMonth,
      daysSinceLastOneOnOne,
      activeDevGoals,
      checkInStatus: compliance.checkInStatus,
      checkInRisk:
        compliance.checkInStatus === "not_required"
          ? "not_required"
          : daysSinceLastOneOnOne === null && compliance.checkInStatus === "overdue"
            ? "no_check_in_yet"
            : compliance.checkInStatus === "overdue"
              ? "overdue"
              : compliance.checkInStatus === "due_soon"
                ? "due_soon"
                : "on_track",
      checkInActionText: compliance.checkInActionText,
      goalsStatus: compliance.goalsStatus,
    };
  });

  const overdueTaskMap = new Map<string, { title: string; assigneeNames: string[]; dueDate: string | null }>();
  const openTaskMap = new Map<
    string,
    {
      title: string;
      assigneeNames: string[];
      priority: string;
      status: string;
      dueDate: string | null;
      overdue: boolean;
    }
  >();

  for (const assignment of assignments) {
    if (!memberUserIds.has(assignment.userId)) continue;
    const task = assignment.task;
    if (task.archivedAt || task.status === "done") continue;

    const assigneeName = assignment.user.name ?? assignment.user.email ?? "Unassigned";
    const overdue = !!(task.dueDate && task.dueDate < now);

    const openExisting = openTaskMap.get(task.id);
    if (openExisting) {
      if (!openExisting.assigneeNames.includes(assigneeName)) {
        openExisting.assigneeNames.push(assigneeName);
      }
    } else {
      openTaskMap.set(task.id, {
        title: task.title,
        assigneeNames: [assigneeName],
        priority: task.priority || "medium",
        status: task.status,
        dueDate: task.dueDate?.toISOString() ?? null,
        overdue,
      });
    }

    if (!overdue || !task.dueDate) continue;
    const existing = overdueTaskMap.get(task.title);
    if (existing) {
      if (!existing.assigneeNames.includes(assigneeName)) {
        existing.assigneeNames.push(assigneeName);
      }
      continue;
    }
    overdueTaskMap.set(task.title, {
      title: task.title,
      assigneeNames: [assigneeName],
      dueDate: task.dueDate.toISOString(),
    });
  }

  const openTasks = [...openTaskMap.values()]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, 25);

  const activeGoalDetails: SenecaActiveGoalDetail[] = devGoalsLive
    .filter((goal) => goal.status === "active" && memberUserIds.has(goal.memberUserId))
    .map((goal) => ({
      memberName: memberNameByUserId.get(goal.memberUserId) ?? "Team member",
      skill: goal.skill,
      recentNote: goal.notes[0]?.body ? truncateText(goal.notes[0].body, 180) : null,
    }))
    .slice(0, 20);

  const upcomingCalendar: SenecaUpcomingCalendarItem[] = calendarEvents
    .filter((event) => {
      if (event.isHidden && event.createdById !== managerUserId) return false;
      const end = event.endDate ?? event.startDate;
      return end.getTime() >= now.getTime();
    })
    .map((event) => ({
      title: event.title,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate?.toISOString() ?? null,
      kind: calendarKind(event),
      memberName: event.oneOnOneMemberUserId
        ? memberNameByUserId.get(event.oneOnOneMemberUserId) ?? null
        : null,
      isVideoMeeting: event.isVideoMeeting,
    }))
    .slice(0, 25);

  const recentWins: SenecaRecentWin[] = [];
  for (const act of recentActivities) {
    if (act.userId && !memberUserIds.has(act.userId)) continue;
    let meta: Record<string, unknown> | null = null;
    if (act.metadata) {
      try {
        meta = JSON.parse(act.metadata) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    const memberName =
      act.user?.name ?? act.user?.email ?? (act.userId ? memberNameByUserId.get(act.userId) ?? null : null);
    if (act.type === "celebration") {
      const message = typeof meta?.message === "string" ? meta.message : null;
      recentWins.push({
        memberName,
        summary: truncateText(message || "Team recognition received", 160),
        createdAt: act.createdAt.toISOString(),
      });
    } else if (act.type === "task_completed") {
      const taskTitle = typeof meta?.taskTitle === "string" ? meta.taskTitle : null;
      if (!taskTitle) continue;
      recentWins.push({
        memberName,
        summary: truncateText(
          `Completed task: ${taskTitle}${meta?.completedOnTime === false ? " (late)" : ""}`,
          160,
        ),
        createdAt: act.createdAt.toISOString(),
      });
    }
    if (recentWins.length >= 12) break;
  }

  // Team-screen managed members: everyone except owners
  const managedMembers = members.filter((m) => m.role !== "owner");
  let checkInCompliant = 0;
  let checkInTotal = 0;
  let goalsCompliant = 0;
  let goalsTotal = 0;

  for (const member of managedMembers) {
    const compliance = complianceByUser.get(member.userId);
    if (workplaceStandards.checkInRequired) {
      checkInTotal++;
      if (compliance?.checkInStatus === "on_track" || compliance?.checkInStatus === "due_soon") {
        checkInCompliant++;
      }
    }
    if (workplaceStandards.goalsRequired) {
      goalsTotal++;
      if (compliance?.goalsStatus === "on_track") goalsCompliant++;
    }
  }

  const checkInCompliancePct =
    checkInTotal > 0 ? Math.round((checkInCompliant / checkInTotal) * 100) : null;
  const developmentPlanCompliancePct =
    goalsTotal > 0 ? Math.round((goalsCompliant / goalsTotal) * 100) : null;
  const healthValues = [checkInCompliancePct, developmentPlanCompliancePct].filter(
    (value): value is number => typeof value === "number",
  );
  const teamHealth: SenecaTeamHealthSummary = {
    checkInCompliancePct,
    developmentPlanCompliancePct,
    teamHealthPct:
      healthValues.length === 0
        ? null
        : Math.round(healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length),
  };

  const membersNeedingCheckIn: SenecaMemberCheckInNeed[] = memberRows
    .filter((row) => {
      const raw = members.find((m) => m.userId === row.userId);
      if (!raw || raw.role === "owner") return false;
      if (!workplaceStandards.checkInRequired) return false;
      return row.checkInRisk === "no_check_in_yet" || row.checkInRisk === "overdue" || row.checkInRisk === "due_soon";
    })
    .map((m) => ({
      name: m.name,
      reason: (m.checkInRisk === "due_soon"
        ? "due_soon"
        : m.checkInRisk === "overdue"
          ? "overdue"
          : "no_check_in_yet") as SenecaMemberCheckInNeed["reason"],
      daysSinceLastOneOnOne: m.daysSinceLastOneOnOne,
    }))
    .sort((a, b) => {
      const rank = (reason: SenecaMemberCheckInNeed["reason"]) =>
        reason === "overdue" ? 0 : reason === "no_check_in_yet" ? 1 : 2;
      const rankDiff = rank(a.reason) - rank(b.reason);
      if (rankDiff !== 0) return rankDiff;
      return (b.daysSinceLastOneOnOne ?? -1) - (a.daysSinceLastOneOnOne ?? -1);
    })
    .slice(0, 8);

  return {
    teamName: team?.name ?? "Workspace",
    managerName,
    members: memberRows,
    overdueTasks: [...overdueTaskMap.values()].slice(0, 10),
    membersNeedingCheckIn,
    publishedCheckInCount: lastCheckIns.length,
    activeDevelopmentGoalsCount: [...devGoalCountByUser.values()].reduce((sum, n) => sum + n, 0),
    developmentGoalsNearingInactive: goalAlerts.nearingInactive
      .filter((alert) => memberUserIds.has(alert.memberUserId))
      .map(mapAlert),
    inactiveDevelopmentGoals: goalAlerts.inactive
      .filter((alert) => memberUserIds.has(alert.memberUserId))
      .map(mapAlert),
    teamHealth,
    upcomingCalendar,
    lastCheckIns,
    openTasks,
    activeGoalDetails,
    recentWins,
  };
}

/** Prompt JSON for the current workspace only — no internal IDs, no other teams. */
export function senecaWorkspaceContextToPrompt(ctx: SenecaWorkspaceContext): string {
  return JSON.stringify(
    {
      scope: "current_workspace_only",
      teamName: ctx.teamName,
      managerName: ctx.managerName,
      teamHealth: ctx.teamHealth,
      members: ctx.members.map((member) => ({
        name: member.name,
        role: member.role,
        overdueTasks: member.overdueTasks,
        activeTasks: member.activeTasks,
        completedTasksThisMonth: member.completedTasksThisMonth,
        daysSinceLastOneOnOne: member.daysSinceLastOneOnOne,
        hasPublishedCheckIn: member.daysSinceLastOneOnOne !== null,
        activeDevGoals: member.activeDevGoals,
        checkInStatus: member.checkInStatus,
        checkInRisk: member.checkInRisk,
        checkInActionText: member.checkInActionText,
        goalsStatus: member.goalsStatus,
      })),
      overdueTasks: ctx.overdueTasks,
      openTasks: ctx.openTasks.map((task) => ({
        title: task.title,
        assigneeNames: task.assigneeNames,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        overdue: task.overdue,
      })),
      publishedCheckInCount: ctx.publishedCheckInCount,
      noPublishedCheckInsYet: ctx.publishedCheckInCount === 0,
      membersNeedingCheckIn: ctx.membersNeedingCheckIn,
      upcomingCalendar: ctx.upcomingCalendar,
      lastCheckIns: ctx.lastCheckIns.map((checkIn) => ({
        memberName: checkIn.memberName,
        date: checkIn.date,
        daysAgo: checkIn.daysAgo,
        templateTitle: checkIn.templateTitle,
        highlights: checkIn.highlights,
        openFollowUpTitles: checkIn.openFollowUpTitles,
        note: "Historical from last published check-in — phrase as previously noted, not current fact.",
      })),
      activeDevelopmentGoalsCount: ctx.activeDevelopmentGoalsCount,
      activeGoalDetails: ctx.activeGoalDetails,
      developmentGoalsNearingInactive: ctx.developmentGoalsNearingInactive.map((goal) => ({
        memberName: goal.memberName,
        skill: goal.skill,
        daysSinceActivity: goal.daysSinceActivity,
        daysUntilInactive: goal.daysUntilInactive,
      })),
      inactiveDevelopmentGoals: ctx.inactiveDevelopmentGoals.map((goal) => ({
        memberName: goal.memberName,
        skill: goal.skill,
        daysSinceActivity: goal.daysSinceActivity,
      })),
      recentWins: ctx.recentWins.map((win) => ({
        memberName: win.memberName,
        summary: win.summary,
        createdAt: win.createdAt,
      })),
    },
    null,
    2,
  );
}

export { emptyTeamHealth };
