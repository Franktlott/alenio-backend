import { prisma } from "../prisma";
import {
  buildDevelopmentGoalActivityAlerts,
  reconcileInactiveDevelopmentGoals,
} from "./development-goal-activity";
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
  goalsStatus?: MemberStandardsCompliance["goalsStatus"];
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

export type SenecaWorkspaceContext = {
  teamName: string;
  managerName: string | null;
  members: SenecaWorkspaceMemberRow[];
  overdueTasks: Array<{ title: string; assigneeNames: string[]; dueDate: string | null }>;
  membersNeedingCheckIn: Array<{ name: string; daysSinceLastOneOnOne: number }>;
  activeDevelopmentGoalsCount: number;
  developmentGoalsNearingInactive: SenecaStaleDevelopmentGoal[];
  inactiveDevelopmentGoals: SenecaStaleDevelopmentGoal[];
  teamHealth: SenecaTeamHealthSummary;
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

/**
 * Live team health for ONE workspace (`teamId` only).
 * Do not load other teams or org-wide aggregates.
 */
export async function buildSenecaWorkspaceContext(
  teamId: string,
  managerUserId: string,
): Promise<SenecaWorkspaceContext> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [team, members, assignments, devGoals, lastMeetings] = await Promise.all([
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
          select: { title: true, status: true, dueDate: true, completedAt: true },
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
        notes: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.oneOnOneMeeting.findMany({
      where: { teamId, status: "published" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        memberUserId: true,
        createdAt: true,
        publishedAt: true,
        status: true,
        templateId: true,
      },
    }),
  ]);

  const workplaceStandards = parseWorkplaceStandards(team?.workplaceStandards);
  const manager = members.find((m) => m.userId === managerUserId);
  const managerName = manager?.user.name ?? manager?.user.email ?? null;

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
    devGoalCountByUser.set(goal.memberUserId, (devGoalCountByUser.get(goal.memberUserId) ?? 0) + 1);
  }

  const memberNameByUserId = new Map(
    members.map((m) => [m.userId, m.user.name ?? m.user.email ?? "Team member"]),
  );
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
  const requiredTemplateId = workplaceStandards.requiredCheckInTemplateId;
  for (const meeting of lastMeetings) {
    if (requiredTemplateId && meeting.templateId !== requiredTemplateId) continue;
    if (!lastCheckInByUser.has(meeting.memberUserId)) {
      const publishedAt = oneOnOnePublishedAt(meeting);
      if (publishedAt) lastCheckInByUser.set(meeting.memberUserId, publishedAt);
    }
  }

  const statsByUser = new Map<
    string,
    { activeTasks: number; overdueTasks: number; completedTasksThisMonth: number }
  >();

  for (const assignment of assignments) {
    const userId = assignment.userId;
    if (!statsByUser.has(userId)) {
      statsByUser.set(userId, { activeTasks: 0, overdueTasks: 0, completedTasksThisMonth: 0 });
    }
    const row = statsByUser.get(userId)!;
    const task = assignment.task;
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
      goalsStatus: compliance.goalsStatus,
    };
  });

  const overdueTaskMap = new Map<string, { title: string; assigneeNames: string[]; dueDate: string | null }>();
  for (const assignment of assignments) {
    const task = assignment.task;
    if (task.status === "done" || !task.dueDate || task.dueDate >= now) continue;
    const assigneeName = assignment.user.name ?? assignment.user.email ?? "Unassigned";
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

  const membersNeedingCheckIn = memberRows
    .filter((row) => {
      const raw = members.find((m) => m.userId === row.userId);
      if (!raw || raw.role === "owner") return false;
      if (!workplaceStandards.checkInRequired) return false;
      return row.checkInStatus === "overdue" || row.checkInStatus === "due_soon";
    })
    .map((m) => ({
      name: m.name,
      daysSinceLastOneOnOne: m.daysSinceLastOneOnOne ?? 999,
    }))
    .sort((a, b) => b.daysSinceLastOneOnOne - a.daysSinceLastOneOnOne)
    .slice(0, 8);

  return {
    teamName: team?.name ?? "Workspace",
    managerName,
    members: memberRows,
    overdueTasks: [...overdueTaskMap.values()].slice(0, 10),
    membersNeedingCheckIn,
    activeDevelopmentGoalsCount: [...devGoalCountByUser.values()].reduce((sum, n) => sum + n, 0),
    developmentGoalsNearingInactive: goalAlerts.nearingInactive.map(mapAlert),
    inactiveDevelopmentGoals: goalAlerts.inactive.map(mapAlert),
    teamHealth,
  };
}

/** Prompt JSON for the current workspace only — no internal IDs. */
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
        activeDevGoals: member.activeDevGoals,
        checkInStatus: member.checkInStatus,
        goalsStatus: member.goalsStatus,
      })),
      overdueTasks: ctx.overdueTasks,
      membersNeedingCheckIn: ctx.membersNeedingCheckIn,
      activeDevelopmentGoalsCount: ctx.activeDevelopmentGoalsCount,
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
    },
    null,
    2,
  );
}

export { emptyTeamHealth };
