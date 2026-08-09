import type { TeamRole } from "@/lib/types";

export function canManageWorkspace(role?: TeamRole | string | null) {
  return role === "owner" || role === "team_leader";
}

export function canOpenWorkspaceTitleMenu({
  enabled,
  teamCount,
  activeRole,
}: {
  enabled: boolean;
  teamCount: number;
  activeRole?: TeamRole | string | null;
}) {
  if (!enabled || teamCount < 1) return false;
  return teamCount > 1 || canManageWorkspace(activeRole);
}

export function workspaceManagementCapabilities(
  role?: TeamRole | string | null,
) {
  const owner = role === "owner";
  const leader = owner || role === "team_leader";
  return {
    canEditDetails: leader,
    canManageMembers: leader,
    canManagePermissions: leader,
    canManageStandards: owner,
    canDelete: owner,
    canLeave: Boolean(role) && !owner,
  };
}
