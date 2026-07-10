import { prisma } from "../prisma";
import type { SenecaWorkspaceContext, SenecaWorkspaceMemberRow } from "./seneca-workspace-context";

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  if (role === "admin") return "Admin";
  return "Member";
}

/** Lightweight Seneca context: team roster only, no live workspace stats. */
export async function buildSenecaChatContext(
  teamId: string,
  managerUserId: string,
): Promise<SenecaWorkspaceContext> {
  const [team, members] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
    prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const manager = members.find((member) => member.userId === managerUserId);
  const memberRows: SenecaWorkspaceMemberRow[] = members.map((member) => ({
    userId: member.userId,
    name: member.user.name ?? member.user.email ?? "Team member",
    role: roleLabel(member.role),
    overdueTasks: 0,
    activeTasks: 0,
    completedTasksThisMonth: 0,
    daysSinceLastOneOnOne: null,
    activeDevGoals: 0,
  }));

  return {
    teamName: team?.name ?? "Workspace",
    managerName: manager?.user.name ?? manager?.user.email ?? null,
    members: memberRows,
    overdueTasks: [],
    membersNeedingCheckIn: [],
    activeDevelopmentGoalsCount: 0,
    developmentGoalsNearingInactive: [],
    inactiveDevelopmentGoals: [],
  };
}

export function senecaChatContextToPrompt(ctx: SenecaWorkspaceContext): string {
  return JSON.stringify(
    {
      teamName: ctx.teamName,
      managerName: ctx.managerName,
      members: ctx.members.map((member) => ({
        name: member.name,
        role: member.role,
      })),
    },
    null,
    2,
  );
}
