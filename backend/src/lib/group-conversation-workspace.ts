import { prisma } from "../prisma";
import { getTeamSubscription, teamSubscriptionRowHasTeamFeatures } from "../routes/subscription";

export type GroupConversationWorkspace = {
  id: string;
  name: string;
};

export type GroupWorkspaceContext = {
  label: string;
  workspaces: GroupConversationWorkspace[];
  isCrossWorkspace: boolean;
};

export type GroupMemberCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  workspaces: GroupConversationWorkspace[];
  workspaceLabel: string;
};

export function formatWorkspaceListLabel(workspaces: Array<{ name: string }>): string {
  if (workspaces.length === 0) return "";
  if (workspaces.length === 1) return workspaces[0].name;
  if (workspaces.length === 2) return `${workspaces[0].name} · ${workspaces[1].name}`;
  return `${workspaces[0].name} · +${workspaces.length - 1}`;
}

export function buildGroupWorkspaceContext(workspaces: GroupConversationWorkspace[]): GroupWorkspaceContext {
  if (workspaces.length === 0) {
    return { label: "", workspaces: [], isCrossWorkspace: false };
  }
  if (workspaces.length === 1) {
    return { label: workspaces[0].name, workspaces, isCrossWorkspace: false };
  }
  return { label: "Cross-workspace", workspaces, isCrossWorkspace: true };
}

export async function findSharedWorkspacesForParticipants(
  userId: string,
  participantUserIds: string[],
): Promise<GroupConversationWorkspace[]> {
  const memberIds = Array.from(new Set([userId, ...participantUserIds]));
  if (memberIds.length === 0) return [];

  const userTeams = await prisma.teamMember.findMany({
    where: { userId },
    select: { team: { select: { id: true, name: true } }, teamId: true },
  });
  if (userTeams.length === 0) return [];

  const shared: GroupConversationWorkspace[] = [];
  for (const membership of userTeams) {
    const overlapCount = await prisma.teamMember.count({
      where: {
        teamId: membership.teamId,
        userId: { in: memberIds },
      },
    });
    if (overlapCount === memberIds.length) {
      shared.push({ id: membership.team.id, name: membership.team.name });
    }
  }

  return shared.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveGroupConversationContext(
  userId: string,
  participantUserIds: string[],
): Promise<GroupWorkspaceContext> {
  const workspaces = await findSharedWorkspacesForParticipants(userId, participantUserIds);
  return buildGroupWorkspaceContext(workspaces);
}

export async function listGroupMemberCandidates(userId: string, query = ""): Promise<GroupMemberCandidate[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((row) => row.teamId);
  if (teamIds.length === 0) return [];

  const trimmedQuery = query.trim();
  const rows = await prisma.teamMember.findMany({
    where: {
      teamId: { in: teamIds },
      userId: { not: userId },
      ...(trimmedQuery.length >= 2
        ? {
            user: {
              OR: [
                { name: { contains: trimmedQuery, mode: "insensitive" } },
                { email: { contains: trimmedQuery, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ team: { name: "asc" } }, { user: { name: "asc" } }],
  });

  const byUser = new Map<
    string,
    {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      workspaces: Map<string, GroupConversationWorkspace>;
    }
  >();

  for (const row of rows) {
    const existing = byUser.get(row.user.id);
    if (existing) {
      existing.workspaces.set(row.team.id, { id: row.team.id, name: row.team.name });
      continue;
    }
    byUser.set(row.user.id, {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      image: row.user.image,
      workspaces: new Map([[row.team.id, { id: row.team.id, name: row.team.name }]]),
    });
  }

  return Array.from(byUser.values())
    .map((entry) => {
      const workspaces = Array.from(entry.workspaces.values()).sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: entry.id,
        name: entry.name,
        email: entry.email,
        image: entry.image,
        workspaces,
        workspaceLabel: formatWorkspaceListLabel(workspaces),
      };
    })
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

export async function assertParticipantsShareWorkspaceWithCreator(
  creatorId: string,
  participantIds: string[],
): Promise<void> {
  const uniqueParticipantIds = Array.from(new Set(participantIds.filter((id) => id && id !== creatorId)));
  if (uniqueParticipantIds.length === 0) return;

  const creatorTeamIds = (
    await prisma.teamMember.findMany({
      where: { userId: creatorId },
      select: { teamId: true },
    })
  ).map((row) => row.teamId);

  if (creatorTeamIds.length === 0) {
    throw new Error("You must belong to a workspace before creating a group.");
  }

  for (const participantId of uniqueParticipantIds) {
    const sharedMembership = await prisma.teamMember.findFirst({
      where: {
        userId: participantId,
        teamId: { in: creatorTeamIds },
      },
      select: { id: true },
    });
    if (!sharedMembership) {
      throw new Error("You can only add people who share a workspace with you.");
    }
  }
}

export async function userHasPaidTeamPlan(userId: string): Promise<boolean> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  for (const { teamId } of memberships) {
    const subscription = await getTeamSubscription(teamId);
    if (teamSubscriptionRowHasTeamFeatures(subscription)) return true;
  }
  return false;
}
