import type { MemberStatsRow } from "@/lib/workplace-standards";
import type {
  ConnectionEntry,
  ConnectionSuggestion,
  TeamMember,
} from "@/lib/types";

export type PeopleStatus = {
  label: string;
  color: string;
  dot: string;
};

export function peopleStatus(
  status?: NonNullable<
    MemberStatsRow["standardsCompliance"]
  >["checkInStatus"],
): PeopleStatus {
  if (status === "on_track") {
    return { label: "On Track", color: "#159A60", dot: "#22C55E" };
  }
  if (status === "due_soon") {
    return { label: "Check-in Due", color: "#D97706", dot: "#F59E0B" };
  }
  if (status === "overdue") {
    return { label: "Needs Attention", color: "#DC2626", dot: "#EF4444" };
  }
  return { label: "No status", color: "#8A96A8", dot: "#CBD5E1" };
}

export type PeopleDirectoryFilter =
  | "everyone"
  | "team"
  | "connections"
  | "suggested";

export type DirectoryBadge = {
  key: "shared_workspace" | "connected" | "manager" | "reason";
  label: string;
};

/** One person can independently be a workspace member, connection, and suggestion. */
export type DirectoryPerson = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  member?: TeamMember;
  connection?: ConnectionEntry;
  suggestion?: ConnectionSuggestion;
};

export function buildPeopleDirectory({
  members,
  connections,
  suggestions,
  excludeUserId,
}: {
  members: TeamMember[];
  connections: ConnectionEntry[];
  suggestions: ConnectionSuggestion[];
  excludeUserId?: string;
}): DirectoryPerson[] {
  const people = new Map<string, DirectoryPerson>();

  const upsert = (
    id: string,
    identity: { name?: string | null; username?: string | null; image?: string | null },
    relationship: Partial<
      Pick<DirectoryPerson, "member" | "connection" | "suggestion">
    >,
  ) => {
    if (!id || id === excludeUserId) return;
    const current = people.get(id);
    people.set(id, {
      ...current,
      id,
      name:
        identity.name?.trim() ||
        current?.name ||
        identity.username?.trim() ||
        "Alenio member",
      username: identity.username ?? current?.username ?? null,
      image: identity.image ?? current?.image ?? null,
      ...relationship,
    });
  };

  members.forEach((member) =>
    upsert(member.userId, member.user, { member }),
  );
  connections.forEach((connection) =>
    upsert(connection.person.id, connection.person, { connection }),
  );
  suggestions.forEach((suggestion) =>
    upsert(suggestion.person.id, suggestion.person, { suggestion }),
  );

  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterDirectoryPeople(
  people: DirectoryPerson[],
  filter: PeopleDirectoryFilter,
): DirectoryPerson[] {
  if (filter === "team") return people.filter((person) => !!person.member);
  if (filter === "connections") {
    return people.filter((person) => !!person.connection);
  }
  if (filter === "suggested") {
    return people.filter((person) => !!person.suggestion);
  }
  return people;
}

export function polishedSuggestionReason(
  reason: ConnectionSuggestion["reasons"][number],
  mutualConnections = 0,
): string {
  if (
    reason.key === "current_workspace" ||
    reason.key === "shared_workspace"
  ) {
    return "Shared Workspace";
  }
  if (reason.key === "mutual_connections") {
    return mutualConnections === 1
      ? "1 mutual connection"
      : `${mutualConnections} mutual connections`;
  }
  if (reason.key === "same_organization") return "Same organization";
  if (reason.key === "recently_joined_workspace") {
    return "Recently joined a shared workspace";
  }
  return reason.label;
}

export function suggestionExplanation(
  suggestion: ConnectionSuggestion,
): string {
  const labels = suggestion.reasons.map((reason) =>
    polishedSuggestionReason(reason, suggestion.mutualConnections),
  );
  return [...new Set(labels)].slice(0, 2).join(" · ") || "Suggested for you";
}

export function selectDirectoryBadges(person: DirectoryPerson): DirectoryBadge[] {
  const badges: DirectoryBadge[] = [];
  const sharesWorkspace =
    !!person.member ||
    person.suggestion?.sharedCurrentWorkspace === true ||
    (person.suggestion?.sharedWorkspaces.length ?? 0) > 0;

  if (sharesWorkspace) {
    badges.push({ key: "shared_workspace", label: "Shared Workspace" });
  }
  if (person.connection) {
    badges.push({ key: "connected", label: "Connected" });
  }
  if (
    person.member?.role === "owner" ||
    person.member?.role === "team_leader" ||
    person.member?.role === "admin"
  ) {
    badges.push({ key: "manager", label: "Manager" });
  }
  if (badges.length < 2 && person.suggestion?.reasons[0]) {
    const reasonBadge: DirectoryBadge = {
      key: "reason",
      label: polishedSuggestionReason(
        person.suggestion.reasons[0],
        person.suggestion.mutualConnections,
      ),
    };
    if (!badges.some((badge) => badge.label === reasonBadge.label)) {
      badges.push(reasonBadge);
    }
  }
  return badges.slice(0, 2);
}
