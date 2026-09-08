import { DECLINED_CONNECTION_COOLDOWN_DAYS } from "./connection-request-policy";

export const CONNECTION_SUGGESTION_DEFAULT_LIMIT = 20;
export const CONNECTION_SUGGESTION_MAX_LIMIT = 50;
export { DECLINED_CONNECTION_COOLDOWN_DAYS };
export const RECENT_WORKSPACE_JOIN_DAYS = 90;
export const CONNECTION_SUGGESTION_DISMISSAL_DAYS = 90;

export type ConnectionSuggestionReasonKey =
  | "current_workspace"
  | "mutual_connections"
  | "same_organization"
  | "shared_workspace"
  | "recently_joined_workspace";

export type ConnectionSuggestionReason = {
  key: ConnectionSuggestionReasonKey;
  label: string;
};

export type ConnectionSuggestionWorkspace = {
  id: string;
  name: string;
  role: string;
  joinedAt: string;
};

export type ConnectionSuggestionMutual = {
  id: string;
  name: string;
  image: string | null;
};

/** Faces shown on the suggestion card; the rest stay as a "and N others" count. */
export const CONNECTION_SUGGESTION_MUTUAL_PREVIEW_LIMIT = 2;

export type ConnectionSuggestion = {
  person: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    profileTitle?: string | null;
    isWorkplaceConnected?: boolean;
  };
  connectionStatus: "none" | "declined";
  sharedCurrentWorkspace: boolean;
  currentWorkspace?: ConnectionSuggestionWorkspace;
  sharedWorkspaces: ConnectionSuggestionWorkspace[];
  mutualConnections: number;
  mutualPreview?: ConnectionSuggestionMutual[];
  reasons: ConnectionSuggestionReason[];
};

export type ConnectionSuggestionDismissalResponse = {
  userId: string;
  dismissedAt: string;
  dismissedUntil: string;
  cooldownDays: number;
};

export type ConnectionSuggestionCandidate = {
  person: ConnectionSuggestion["person"];
  sharedWorkspaces: Array<Omit<ConnectionSuggestionWorkspace, "joinedAt"> & { joinedAt: Date }>;
  mutualConnections: number;
  mutualPreview?: ConnectionSuggestionMutual[];
  sharesOrganization: boolean;
  connection?: {
    status: string;
    updatedAt: Date;
  } | null;
  blocked?: boolean;
};

type RankedSuggestion = ConnectionSuggestion & {
  rank: [number, number, number, number, number, number];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Applies eligibility, deduplication, reason generation and deterministic ranking.
 * Database access deliberately stays in the route so this policy is cheap to unit test.
 */
export function buildConnectionSuggestions(input: {
  candidates: ConnectionSuggestionCandidate[];
  currentTeamId?: string;
  limit: number;
  now?: Date;
  dismissedAtByPersonId?: ReadonlyMap<string, Date>;
}): ConnectionSuggestion[] {
  const now = input.now ?? new Date();
  const declinedCutoff = now.getTime() - DECLINED_CONNECTION_COOLDOWN_DAYS * DAY_MS;
  const dismissalCutoff =
    now.getTime() - CONNECTION_SUGGESTION_DISMISSAL_DAYS * DAY_MS;
  const recentJoinCutoff = now.getTime() - RECENT_WORKSPACE_JOIN_DAYS * DAY_MS;
  const merged = mergeCandidates(input.candidates);
  const ranked: RankedSuggestion[] = [];

  for (const candidate of merged.values()) {
    const connection = candidate.connection;
    const dismissedAt = input.dismissedAtByPersonId?.get(candidate.person.id);
    if (
      candidate.blocked ||
      (dismissedAt && dismissedAt.getTime() > dismissalCutoff) ||
      connection?.status === "accepted" ||
      connection?.status === "pending" ||
      (connection?.status === "declined" && connection.updatedAt.getTime() > declinedCutoff)
    ) {
      continue;
    }

    const workspaces = [...candidate.sharedWorkspaces].sort(
      (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime() || a.id.localeCompare(b.id),
    );
    const current = input.currentTeamId
      ? workspaces.find((workspace) => workspace.id === input.currentTeamId)
      : undefined;
    const secondaryWorkspaces = input.currentTeamId
      ? workspaces.filter((workspace) => workspace.id !== input.currentTeamId)
      : workspaces;
    const latestJoinedAt = workspaces[0]?.joinedAt.getTime() ?? 0;
    const recentlyJoined = latestJoinedAt >= recentJoinCutoff;
    const hasEvidence =
      Boolean(current) ||
      candidate.mutualConnections > 0 ||
      candidate.sharesOrganization ||
      secondaryWorkspaces.length > 0;
    if (!hasEvidence) continue;

    const reasons: ConnectionSuggestionReason[] = [];
    if (current) reasons.push({ key: "current_workspace", label: "Current workspace" });
    if (candidate.mutualConnections > 0) {
      reasons.push({
        key: "mutual_connections",
        label: `${candidate.mutualConnections} mutual connection${
          candidate.mutualConnections === 1 ? "" : "s"
        }`,
      });
    }
    if (candidate.sharesOrganization) {
      reasons.push({ key: "same_organization", label: "Same organization" });
    }
    if (secondaryWorkspaces.length > 0) {
      reasons.push({ key: "shared_workspace", label: "Shared workspace" });
    }
    if (recentlyJoined) {
      reasons.push({
        key: "recently_joined_workspace",
        label: "Recently joined a shared workspace",
      });
    }

    const serializeWorkspace = (
      workspace: ConnectionSuggestionCandidate["sharedWorkspaces"][number],
    ): ConnectionSuggestionWorkspace => ({
      ...workspace,
      joinedAt: workspace.joinedAt.toISOString(),
    });
    ranked.push({
      person: candidate.person,
      connectionStatus: connection?.status === "declined" ? "declined" : "none",
      sharedCurrentWorkspace: Boolean(current),
      ...(current ? { currentWorkspace: serializeWorkspace(current) } : {}),
      sharedWorkspaces: workspaces.map(serializeWorkspace),
      mutualConnections: candidate.mutualConnections,
      ...(candidate.mutualPreview && candidate.mutualPreview.length > 0
        ? {
            mutualPreview: candidate.mutualPreview.slice(
              0,
              CONNECTION_SUGGESTION_MUTUAL_PREVIEW_LIMIT,
            ),
          }
        : {}),
      reasons,
      rank: [
        current ? 1 : 0,
        candidate.mutualConnections,
        candidate.sharesOrganization ? 1 : 0,
        secondaryWorkspaces.length > 0 ? 1 : 0,
        recentlyJoined ? 1 : 0,
        latestJoinedAt,
      ],
    });
  }

  ranked.sort((a, b) => {
    for (let index = 0; index < a.rank.length; index += 1) {
      const difference = b.rank[index]! - a.rank[index]!;
      if (difference !== 0) return difference;
    }
    return a.person.name.localeCompare(b.person.name) || a.person.id.localeCompare(b.person.id);
  });

  return ranked.slice(0, Math.max(0, Math.min(input.limit, CONNECTION_SUGGESTION_MAX_LIMIT))).map(
    ({ rank: _rank, ...suggestion }) => suggestion,
  );
}

function mergeCandidates(
  candidates: ConnectionSuggestionCandidate[],
): Map<string, ConnectionSuggestionCandidate> {
  const merged = new Map<string, ConnectionSuggestionCandidate>();
  for (const candidate of candidates) {
    const existing = merged.get(candidate.person.id);
    if (!existing) {
      merged.set(candidate.person.id, {
        ...candidate,
        sharedWorkspaces: dedupeWorkspaces(candidate.sharedWorkspaces),
      });
      continue;
    }

    existing.mutualConnections = Math.max(
      existing.mutualConnections,
      candidate.mutualConnections,
    );
    if ((candidate.mutualPreview?.length ?? 0) > (existing.mutualPreview?.length ?? 0)) {
      existing.mutualPreview = candidate.mutualPreview;
    }
    existing.sharesOrganization ||= candidate.sharesOrganization;
    existing.blocked ||= candidate.blocked;
    existing.sharedWorkspaces = dedupeWorkspaces([
      ...existing.sharedWorkspaces,
      ...candidate.sharedWorkspaces,
    ]);
    existing.connection = moreRestrictiveConnection(existing.connection, candidate.connection);
  }
  return merged;
}

function dedupeWorkspaces(
  workspaces: ConnectionSuggestionCandidate["sharedWorkspaces"],
): ConnectionSuggestionCandidate["sharedWorkspaces"] {
  const byId = new Map<string, ConnectionSuggestionCandidate["sharedWorkspaces"][number]>();
  for (const workspace of workspaces) {
    const existing = byId.get(workspace.id);
    if (!existing || workspace.joinedAt > existing.joinedAt) byId.set(workspace.id, workspace);
  }
  return [...byId.values()];
}

function moreRestrictiveConnection(
  first: ConnectionSuggestionCandidate["connection"],
  second: ConnectionSuggestionCandidate["connection"],
): ConnectionSuggestionCandidate["connection"] {
  if (!first) return second;
  if (!second) return first;
  const priority = (status: string): number =>
    status === "accepted" ? 3 : status === "pending" ? 2 : status === "declined" ? 1 : 0;
  const difference = priority(second.status) - priority(first.status);
  if (difference !== 0) return difference > 0 ? second : first;
  return second.updatedAt > first.updatedAt ? second : first;
}
