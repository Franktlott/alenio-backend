import { prisma } from "../prisma";

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

export type SenecaWorkspaceContext = {
  teamName: string;
  managerName: string | null;
  members: SenecaWorkspaceMemberRow[];
  overdueTasks: Array<{ title: string; assigneeNames: string[]; dueDate: string | null }>;
  membersNeedingCheckIn: Array<{ name: string; daysSinceLastOneOnOne: number }>;
  activeDevelopmentGoalsCount: number;
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
      where: { teamId, status: "active" },
      select: { memberUserId: true },
    }),
    prisma.oneOnOneMeeting.findMany({
      where: { teamId, status: "published" },
      orderBy: { createdAt: "desc" },
      select: { memberUserId: true, createdAt: true },
    }),
  ]);

  const manager = members.find((m) => m.userId === managerUserId);
  const managerName = manager?.user.name ?? manager?.user.email ?? null;

  const devGoalCountByUser = new Map<string, number>();
  for (const goal of devGoals) {
    devGoalCountByUser.set(goal.memberUserId, (devGoalCountByUser.get(goal.memberUserId) ?? 0) + 1);
  }

  const lastCheckInByUser = new Map<string, Date>();
  for (const meeting of lastMeetings) {
    if (!lastCheckInByUser.has(meeting.memberUserId)) {
      lastCheckInByUser.set(meeting.memberUserId, meeting.createdAt);
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
    activeDevelopmentGoalsCount: devGoals.length,
  };
}

export function senecaWorkspaceContextToPrompt(ctx: SenecaWorkspaceContext): string {
  return JSON.stringify(ctx, null, 2);
}
