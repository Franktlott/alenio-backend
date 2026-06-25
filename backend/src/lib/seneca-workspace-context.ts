import { prisma } from "../prisma";
import {
  buildDevelopmentGoalActivityAlerts,
  reconcileInactiveDevelopmentGoals,
} from "./development-goal-activity";
import { oneOnOnePublishedAt } from "./one-on-one-meeting-dates";

export type SenecaWorkspaceMemberRow = {
  userId: string;
  name: string;
  role: string;
  overdueTasks: number;
  activeTasks: number;
  completedTasksThisMonth: number;
  daysSinceLastOneOnOne: number | null;
  activeDevGoals: number;
};

export type SenecaStaleDevelopmentGoal = {
  goalId: string;
  memberUserId: string;
  memberName: string;
  skill: string;
  daysSinceActivity: number;
  daysUntilInactive: number | null;
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
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  if (role === "admin") return "Admin";
  return "Member";
}

export async function buildSenecaWorkspaceContext(
  teamId: string,
  managerUserId: string,
): Promise<SenecaWorkspaceContext> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [team, members, assignments, devGoals, lastMeetings] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
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
      select: { memberUserId: true, createdAt: true, publishedAt: true, status: true },
    }),
  ]);

  const manager = members.find((m) => m.userId === managerUserId);
  const managerName = manager?.user.name ?? manager?.user.email ?? null;

  const devGoalCountByUser = new Map<string, number>();
  const inactiveIds = await reconcileInactiveDevelopmentGoals(devGoals, async (ids) => {
    await prisma.developmentGoal.updateMany({
      where: { id: { in: ids } },
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
  for (const meeting of lastMeetings) {
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

  const memberRows: SenecaWorkspaceMemberRow[] = members.map((member) => {
    const stats = statsByUser.get(member.userId) ?? {
      activeTasks: 0,
      overdueTasks: 0,
      completedTasksThisMonth: 0,
    };
    const lastCheckIn = lastCheckInByUser.get(member.userId);
    const daysSinceLastOneOnOne = lastCheckIn
      ? Math.floor((now.getTime() - lastCheckIn.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    return {
      userId: member.userId,
      name: member.user.name ?? member.user.email ?? "Team member",
      role: roleLabel(member.role),
      overdueTasks: stats.overdueTasks,
      activeTasks: stats.activeTasks,
      completedTasksThisMonth: stats.completedTasksThisMonth,
      daysSinceLastOneOnOne,
      activeDevGoals: devGoalCountByUser.get(member.userId) ?? 0,
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

  const membersNeedingCheckIn = memberRows
    .filter((m) => m.userId !== managerUserId && (m.daysSinceLastOneOnOne == null || m.daysSinceLastOneOnOne >= 21))
    .map((m) => ({
      name: m.name,
      daysSinceLastOneOnOne: m.daysSinceLastOneOnOne ?? 999,
    }))
    .sort((a, b) => b.daysSinceLastOneOnOne - a.daysSinceLastOneOnOne)
    .slice(0, 5);

  return {
    teamName: team?.name ?? "Workspace",
    managerName,
    members: memberRows,
    overdueTasks: [...overdueTaskMap.values()].slice(0, 10),
    membersNeedingCheckIn,
    activeDevelopmentGoalsCount: [...devGoalCountByUser.values()].reduce((sum, n) => sum + n, 0),
    developmentGoalsNearingInactive: goalAlerts.nearingInactive.map(mapAlert),
    inactiveDevelopmentGoals: goalAlerts.inactive.map(mapAlert),
  };
}

export function senecaWorkspaceContextToPrompt(ctx: SenecaWorkspaceContext): string {
  return JSON.stringify(ctx, null, 2);
}
