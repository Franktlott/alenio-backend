import { describe, expect, test } from "bun:test";
import {
  eligibleProfileWorkspaces,
  manageableProfileWorkspaces,
  resolveProfileWorkspaceId,
} from "./profile-workspace-context";
import type { PublicProfileWorkspace, Team } from "./types";

const workspace = (id: string): PublicProfileWorkspace => ({
  id,
  name: `Workspace ${id}`,
  image: null,
  role: "member",
  joinedAt: "2026-01-01T00:00:00.000Z",
});

const team = (id: string, role: Team["role"]): Team => ({
  id,
  name: `Workspace ${id}`,
  inviteCode: id,
  role,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("canonical profile workspace context", () => {
  test("keeps personal-only and peer/admin viewers out of workplace tabs", () => {
    const shared = [workspace("a")];
    expect(eligibleProfileWorkspaces({ sharedWorkspaces: [], viewerTeams: [], isSelf: false })).toEqual([]);
    expect(eligibleProfileWorkspaces({ sharedWorkspaces: shared, viewerTeams: [team("a", "member")], isSelf: false })).toEqual([]);
    expect(eligibleProfileWorkspaces({ sharedWorkspaces: shared, viewerTeams: [team("a", "admin")], isSelf: false })).toEqual([]);
  });

  test("allows self, owner, and team leader contexts", () => {
    const shared = [workspace("a"), workspace("b")];
    expect(eligibleProfileWorkspaces({
      sharedWorkspaces: shared,
      viewerTeams: [team("a", "member"), team("b", "admin")],
      isSelf: true,
    })).toEqual(shared);
    expect(eligibleProfileWorkspaces({
      sharedWorkspaces: shared,
      viewerTeams: [team("a", "owner"), team("b", "team_leader")],
      isSelf: false,
    })).toEqual(shared);
  });

  test("prefers explicit then active then first workspace", () => {
    const eligibleWorkspaces = [workspace("a"), workspace("b")];
    expect(resolveProfileWorkspaceId({ eligibleWorkspaces, preferredTeamId: "b", activeTeamId: "a" })).toBe("b");
    expect(resolveProfileWorkspaceId({ eligibleWorkspaces, preferredTeamId: "missing", activeTeamId: "a" })).toBe("a");
    expect(resolveProfileWorkspaceId({ eligibleWorkspaces, preferredTeamId: "missing", activeTeamId: "missing" })).toBe("a");
    expect(resolveProfileWorkspaceId({ eligibleWorkspaces: [] })).toBeNull();
  });

  test("lists every workspace the viewer can manage the person in", () => {
    const shared = [workspace("a"), workspace("b"), workspace("c")];
    expect(
      manageableProfileWorkspaces({
        sharedWorkspaces: shared,
        viewerTeams: [team("a", "owner"), team("b", "team_leader"), team("c", "member")],
        isSelf: false,
      }).map((entry) => entry.id),
    ).toEqual(["a", "b"]);
  });

  test("never manages yourself, workspace owners, or leaders as a leader", () => {
    const asOwner: PublicProfileWorkspace = { ...workspace("a"), role: "owner" };
    const asLeader: PublicProfileWorkspace = { ...workspace("b"), role: "team_leader" };
    expect(
      manageableProfileWorkspaces({
        sharedWorkspaces: [asOwner],
        viewerTeams: [team("a", "owner")],
        isSelf: false,
      }),
    ).toEqual([]);
    expect(
      manageableProfileWorkspaces({
        sharedWorkspaces: [asLeader],
        viewerTeams: [team("b", "team_leader")],
        isSelf: false,
      }),
    ).toEqual([]);
    expect(
      manageableProfileWorkspaces({
        sharedWorkspaces: [asLeader],
        viewerTeams: [team("b", "owner")],
        isSelf: false,
      }),
    ).toEqual([asLeader]);
    expect(
      manageableProfileWorkspaces({
        sharedWorkspaces: [workspace("a")],
        viewerTeams: [team("a", "owner")],
        isSelf: true,
      }),
    ).toEqual([]);
  });
});
