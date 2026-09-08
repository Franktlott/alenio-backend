import { prisma } from "../prisma";
import { findUnmessageableUserIds } from "./messaging-permission";

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
  username: string | null;
  image: string | null;
  isWorkplaceConnected: boolean;
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

export async function resolveGroupConversationContext(
  userId: string,
  _participantUserIds: string[],
  teamId?: string | null,
): Promise<GroupWorkspaceContext> {
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    if (team) {
      return buildGroupWorkspaceContext([{ id: team.id, name: team.name }]);
    }
  }
  // A group with no teamId is personal, not workspace-owned. Inferring a label from
  // shared memberships would stamp an employer's name onto a private conversation.
  return buildGroupWorkspaceContext([]);
}

export async function listGroupMemberCandidates(
  userId: string,
  query = "",
  teamId?: string | null,
  options?: { personal?: boolean },
): Promise<GroupMemberCandidate[]> {
  const trimmedQuery = query.trim();

  // A personal group draws on personal relationships, never on an employer roster,
  // even when the creator does happen to belong to workspaces.
  if (options?.personal && !teamId) {
    return listPersonalGroupCandidates(userId, trimmedQuery);
  }

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  let teamIds = memberships.map((row) => row.teamId);
  if (teamId) {
    if (!teamIds.includes(teamId)) return [];
    teamIds = [teamId];
  }

  // Someone with no workspace still has people: connections and anyone they already chat with.
  if (teamIds.length === 0) {
    return listPersonalGroupCandidates(userId, trimmedQuery);
  }

  const rows = await prisma.teamMember.findMany({
    where: {
      teamId: { in: teamIds },
      userId: { not: userId },
      ...(trimmedQuery.length >= 2
        ? {
            user: {
              OR: [
                { name: { contains: trimmedQuery, mode: "insensitive" } },
                { username: { contains: trimmedQuery.toLowerCase() } },
                { email: { contains: trimmedQuery, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, username: true, image: true } },
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
      username: string | null;
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
      username: row.user.username,
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
        username: entry.username,
        image: entry.image,
        isWorkplaceConnected: true,
        workspaces,
        workspaceLabel: formatWorkspaceListLabel(workspaces),
      };
    })
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

/** Accepted, unblocked connections a user can add to a personal group. */
async function listPersonalGroupCandidates(
  userId: string,
  trimmedQuery: string,
): Promise<GroupMemberCandidate[]> {
  const [connections, blocks] = await Promise.all([
    prisma.connection.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: userId }, { recipientId: userId }],
      },
      select: { requesterId: true, recipientId: true },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  const blockedIds = new Set(
    blocks.flatMap((row) => [row.blockerId, row.blockedId]).filter((id) => id !== userId),
  );

  const candidateIds = new Set<string>();
  for (const row of connections) {
    const otherId = row.requesterId === userId ? row.recipientId : row.requesterId;
    if (!blockedIds.has(otherId)) candidateIds.add(otherId);
  }
  if (candidateIds.size === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: Array.from(candidateIds) },
      ...(trimmedQuery.length >= 2
        ? {
            OR: [
              { name: { contains: trimmedQuery, mode: "insensitive" } },
              { username: { contains: trimmedQuery.toLowerCase() } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      _count: { select: { teamMembers: true } },
    },
    orderBy: { name: "asc" },
  });

  // No email: outside a shared workspace there is no basis for exposing an address.
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: null,
    username: user.username,
    image: user.image,
    isWorkplaceConnected: user._count.teamMembers > 0,
    workspaces: [],
    workspaceLabel: "",
  }));
}

/**
 * Validation for a personal group (`teamId` null). Workspace membership is irrelevant
 * here; what matters is that the creator is allowed to message everyone they add.
 */
export async function assertPersonalGroupParticipantsAllowed(
  creatorId: string,
  participantIds: string[],
): Promise<void> {
  const uniqueParticipantIds = Array.from(
    new Set(participantIds.filter((id) => id && id !== creatorId)),
  );
  const connections = await prisma.connection.findMany({
    where: {
      status: "accepted",
      OR: [
        {
          requesterId: creatorId,
          recipientId: { in: uniqueParticipantIds },
        },
        {
          recipientId: creatorId,
          requesterId: { in: uniqueParticipantIds },
        },
      ],
    },
    select: { requesterId: true, recipientId: true },
  });
  const connectedIds = new Set(
    connections.map((connection) =>
      connection.requesterId === creatorId
        ? connection.recipientId
        : connection.requesterId,
    ),
  );
  if (uniqueParticipantIds.some((id) => !connectedIds.has(id))) {
    throw new Error("You can only add your connections to a personal group.");
  }

  const blockedIds = await findUnmessageableUserIds(
    creatorId,
    uniqueParticipantIds,
  );
  if (blockedIds.length > 0) {
    throw new Error("One or more connections are unavailable.");
  }
}

export async function assertParticipantsShareWorkspaceWithCreator(
  creatorId: string,
  participantIds: string[],
  teamId?: string | null,
): Promise<void> {
  const uniqueParticipantIds = Array.from(new Set(participantIds.filter((id) => id && id !== creatorId)));
  if (uniqueParticipantIds.length === 0) {
    if (teamId) {
      const creatorInTeam = await prisma.teamMember.findFirst({
        where: { userId: creatorId, teamId },
        select: { id: true },
      });
      if (!creatorInTeam) {
        throw new Error("You must belong to that workspace to create a group in it.");
      }
    }
    return;
  }

  const creatorTeamIds = (
    await prisma.teamMember.findMany({
      where: { userId: creatorId },
      select: { teamId: true },
    })
  ).map((row) => row.teamId);

  if (creatorTeamIds.length === 0) {
    throw new Error("You must belong to a workspace before creating a group.");
  }

  if (teamId && !creatorTeamIds.includes(teamId)) {
    throw new Error("You must belong to that workspace to create a group in it.");
  }

  const allowedTeamIds = teamId ? [teamId] : creatorTeamIds;

  for (const participantId of uniqueParticipantIds) {
    const sharedMembership = await prisma.teamMember.findFirst({
      where: {
        userId: participantId,
        teamId: { in: allowedTeamIds },
      },
      select: { id: true },
    });
    if (!sharedMembership) {
      throw new Error(
        teamId
          ? "You can only add people who belong to that workspace."
          : "You can only add people who share a workspace with you.",
      );
    }
  }
}

