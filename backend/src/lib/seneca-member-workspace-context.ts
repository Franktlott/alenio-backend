import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";

export type SenecaMemberWorkspaceContext = {
  scope: "current_workspace_self_only";
  grounding: string;
  workspace: { name: string; role: string };
  profile: {
    name: string;
    username: string | null;
    profileTitle: string | null;
    profileOrganization: string | null;
    profileLocation: string | null;
    profileBio: string | null;
  };
  ownTasks: Array<{
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
  }>;
  ownGoals: Array<{
    skill: string;
    description: string | null;
    status: string;
    dueDate: string | null;
  }>;
  ownPublishedCheckIns: Array<{
    templateTitle: string;
    publishedAt: string | null;
  }>;
};

export function memberWorkspaceGrounding(role: string): string {
  return `The requester is a ${role} in this workspace. Use only their own profile, assigned tasks, development goals, and published check-in metadata below plus the workspace name. Never infer, request, summarize, compare, or expose another member's data, team-wide metrics, private manager notes, workspace Studio content, or manager-only actions.`;
}

export async function buildSenecaMemberWorkspaceContext(
  teamId: string,
  userId: string,
  db: PrismaClient = prisma,
): Promise<SenecaMemberWorkspaceContext> {
  const [membership, assignments, goals, checkIns] = await Promise.all([
    db.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: {
        role: true,
        team: { select: { name: true } },
        user: {
          select: {
            name: true,
            username: true,
            profileTitle: true,
            profileOrganization: true,
            profileLocation: true,
            profileBio: true,
          },
        },
      },
    }),
    db.taskAssignment.findMany({
      where: { userId, task: { teamId, kind: "workspace_task", archivedAt: null } },
      select: {
        task: { select: { title: true, status: true, priority: true, dueDate: true } },
      },
      orderBy: { assignedAt: "desc" },
      take: 30,
    }),
    db.developmentGoal.findMany({
      where: { teamId, memberUserId: userId, archivedAt: null },
      select: { skill: true, description: true, status: true, dueDate: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.oneOnOneMeeting.findMany({
      where: { teamId, memberUserId: userId, status: "published" },
      select: { templateTitle: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);
  if (!membership) throw new Error("Workspace membership not found");

  return {
    scope: "current_workspace_self_only",
    grounding: memberWorkspaceGrounding(membership.role),
    workspace: { name: membership.team.name, role: membership.role },
    profile: membership.user,
    ownTasks: assignments.map(({ task }) => ({
      ...task,
      dueDate: task.dueDate?.toISOString() ?? null,
    })),
    ownGoals: goals.map((goal) => ({
      ...goal,
      dueDate: goal.dueDate?.toISOString() ?? null,
    })),
    ownPublishedCheckIns: checkIns.map((checkIn) => ({
      templateTitle: checkIn.templateTitle,
      publishedAt: checkIn.publishedAt?.toISOString() ?? null,
    })),
  };
}

export function senecaMemberWorkspaceContextToPrompt(
  context: SenecaMemberWorkspaceContext,
): string {
  return JSON.stringify(context, null, 2);
}
