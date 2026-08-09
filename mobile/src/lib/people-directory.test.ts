import { describe, expect, test } from "bun:test";
import {
  buildPeopleDirectory,
  filterDirectoryPeople,
  peopleStatus,
  polishedSuggestionReason,
  selectDirectoryBadges,
  suggestionExplanation,
} from "./people-directory";
import type {
  ConnectionEntry,
  ConnectionSuggestion,
  TeamMember,
} from "./types";

describe("peopleStatus", () => {
  test("maps a healthy check-in to one subtle status", () => {
    expect(peopleStatus("on_track").label).toBe("On Track");
  });

  test("maps upcoming and overdue check-ins to attention states", () => {
    expect(peopleStatus("due_soon").label).toBe("Check-in Due");
    expect(peopleStatus("overdue").label).toBe("Needs Attention");
  });

  test("uses a neutral status when no schedule exists", () => {
    expect(peopleStatus(undefined).label).toBe("No status");
  });
});

const member: TeamMember = {
  id: "member-1",
  userId: "person-1",
  teamId: "team-1",
  role: "team_leader",
  joinedAt: "2026-01-01",
  user: { id: "person-1", name: "Alex Team", email: "alex@example.com", image: null },
};
const connection: ConnectionEntry = {
  id: "connection-1",
  person: { id: "person-1", name: "Alex Connected", username: "alex", image: null },
  status: "connected",
  createdAt: "2026-01-02",
  updatedAt: "2026-01-02",
};
const suggestion: ConnectionSuggestion = {
  person: { id: "person-1", name: "Alex Suggested", username: "alex", image: null },
  connectionStatus: "none",
  sharedCurrentWorkspace: true,
  currentWorkspace: {
    id: "team-1",
    name: "Operations",
    role: "team_leader",
    joinedAt: "2026-01-01",
  },
  sharedWorkspaces: [],
  mutualConnections: 3,
  reasons: [
    { key: "current_workspace", label: "Current workspace" },
    { key: "mutual_connections", label: "3 mutual connections" },
  ],
};

describe("independent people relationships", () => {
  test("deduplicates identities while preserving every relationship", () => {
    const people = buildPeopleDirectory({
      members: [member],
      connections: [connection],
      suggestions: [suggestion],
    });

    expect(people).toHaveLength(1);
    expect(people[0].member?.id).toBe(member.id);
    expect(people[0].connection?.id).toBe(connection.id);
    expect(people[0].suggestion).toBe(suggestion);
  });

  test("filters each relationship independently", () => {
    const suggestionOnly = {
      ...suggestion,
      person: { ...suggestion.person, id: "person-2", name: "Sam Suggested" },
    };
    const people = buildPeopleDirectory({
      members: [member],
      connections: [connection],
      suggestions: [suggestionOnly],
    });

    expect(filterDirectoryPeople(people, "everyone")).toHaveLength(2);
    expect(filterDirectoryPeople(people, "team").map((person) => person.id)).toEqual(["person-1"]);
    expect(filterDirectoryPeople(people, "connections").map((person) => person.id)).toEqual(["person-1"]);
    expect(filterDirectoryPeople(people, "suggested").map((person) => person.id)).toEqual(["person-2"]);
  });

  test("prioritizes relationship badges and caps them at two", () => {
    const [person] = buildPeopleDirectory({
      members: [member],
      connections: [connection],
      suggestions: [suggestion],
    });
    expect(selectDirectoryBadges(person)).toEqual([
      { key: "shared_workspace", label: "Shared Workspace" },
      { key: "connected", label: "Connected" },
    ]);
  });

  test("does not repeat Shared Workspace as a suggestion reason badge", () => {
    const [person] = buildPeopleDirectory({
      members: [member],
      connections: [],
      suggestions: [suggestion],
    });
    expect(selectDirectoryBadges(person)).toEqual([
      { key: "shared_workspace", label: "Shared Workspace" },
      { key: "manager", label: "Manager" },
    ]);
  });

  test("polishes backend evidence copy", () => {
    expect(polishedSuggestionReason(suggestion.reasons[0], 3)).toBe("Shared Workspace");
    expect(suggestionExplanation(suggestion)).toBe(
      "Shared Workspace · 3 mutual connections",
    );
  });
});
