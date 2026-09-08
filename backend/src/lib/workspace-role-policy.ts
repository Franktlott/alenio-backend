export type WorkspaceRole = string | null | undefined;

export const WORKSPACE_MANAGER_ROLES = ["owner", "team_leader"] as const;

const WORKSPACE_MANAGER_ROLE_SET = new Set<string>(WORKSPACE_MANAGER_ROLES);

/**
 * Workspace relationship management is deliberately limited to the current
 * owner/team-leader roles. Legacy admin and member rows remain readable, but
 * do not inherit management capabilities.
 */
export function canManageWorkspaceRelationships(role: WorkspaceRole): boolean {
  return typeof role === "string" && WORKSPACE_MANAGER_ROLE_SET.has(role);
}

export const canManageWorkspaceRoster = canManageWorkspaceRelationships;
export const canManageWorkspaceJoinRequests = canManageWorkspaceRelationships;
export const canManageWorkspaceSettings = canManageWorkspaceRelationships;
export const canManageDevelopmentGoals = canManageWorkspaceRelationships;
export function canManageAssignedDevelopmentGoals(
  role: WorkspaceRole,
  viewerUserId: string,
  goalMemberUserId: string,
): boolean {
  return (
    canManageDevelopmentGoals(role) ||
    (viewerUserId.length > 0 && viewerUserId === goalMemberUserId)
  );
}
export const canCompleteDevelopmentGoalSteps =
  canManageAssignedDevelopmentGoals;
export const canManageCheckIns = canManageWorkspaceRelationships;
export const canManageMemberNextActions = canManageWorkspaceRelationships;
export const canViewFormerWorkspaceMembers = canManageWorkspaceRelationships;
export const canManageWorkspaceCalendar = canManageWorkspaceRelationships;
export const canManageWorkspaceSpaces = canManageWorkspaceRelationships;
export const canManageWorkspaceTasks = canManageWorkspaceRelationships;
export const canModerateWorkspaceContent = canManageWorkspaceRelationships;
export const canAccessWorkspaceManagerInsights = canManageWorkspaceRelationships;
export const canManageSenecaStudio = canManageWorkspaceRelationships;
