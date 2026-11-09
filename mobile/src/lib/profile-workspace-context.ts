import type { PublicProfileWorkspace, Team } from "@/lib/types";

export function eligibleProfileWorkspaces({
  sharedWorkspaces,
  viewerTeams,
  isSelf,
}: {
  sharedWorkspaces: PublicProfileWorkspace[];
  viewerTeams: Team[];
  isSelf: boolean;
}): PublicProfileWorkspace[] {
  const viewerRoleByTeam = new Map(viewerTeams.map((team) => [team.id, team.role]));
  return sharedWorkspaces.filter((workspace) => {
    const viewerRole = viewerRoleByTeam.get(workspace.id);
    if (!viewerRole) return false;
    return isSelf || viewerRole === "owner" || viewerRole === "team_leader";
  });
}

/**
 * Every shared workspace where the viewer can change this person's membership.
 * Owners manage anyone below them; team leaders manage plain members only.
 */
export function manageableProfileWorkspaces({
  sharedWorkspaces,
  viewerTeams,
  isSelf,
}: {
  sharedWorkspaces: PublicProfileWorkspace[];
  viewerTeams: Team[];
  isSelf: boolean;
}): PublicProfileWorkspace[] {
  if (isSelf) return [];
  const viewerRoleByTeam = new Map(viewerTeams.map((team) => [team.id, team.role]));
  return sharedWorkspaces.filter((workspace) => {
    if (workspace.role === "owner") return false;
    const viewerRole = viewerRoleByTeam.get(workspace.id);
    if (viewerRole === "owner") return true;
    return viewerRole === "team_leader" && workspace.role === "member";
  });
}

export function resolveProfileWorkspaceId({
  eligibleWorkspaces,
  preferredTeamId,
  activeTeamId,
}: {
  eligibleWorkspaces: PublicProfileWorkspace[];
  preferredTeamId?: string | null;
  activeTeamId?: string | null;
}): string | null {
  const ids = new Set(eligibleWorkspaces.map((workspace) => workspace.id));
  if (preferredTeamId && ids.has(preferredTeamId)) return preferredTeamId;
  if (activeTeamId && ids.has(activeTeamId)) return activeTeamId;
  return eligibleWorkspaces[0]?.id ?? null;
}
