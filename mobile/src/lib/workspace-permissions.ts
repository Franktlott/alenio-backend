import type { TeamMember, TeamRole } from "@/lib/types";

export type EditableWorkspaceRole = "member" | "team_leader";

export type WorkspaceRolePresentation = {
  label: string;
  shortLabel: string;
  description: string;
  badgeBackground: string;
  badgeText: string;
};

const ROLE_PRESENTATION: Record<TeamRole, WorkspaceRolePresentation> = {
  owner: {
    label: "Owner",
    shortLabel: "Owner",
    description: "Full workspace control, including billing and permissions.",
    badgeBackground: "#EFE9FF",
    badgeText: "#6d28d9",
  },
  team_leader: {
    label: "Team Leader",
    shortLabel: "Leader",
    description: "Leads day-to-day work and supports workspace members.",
    badgeBackground: "#F3EEFF",
    badgeText: "#7C3AED",
  },
  member: {
    label: "Member",
    shortLabel: "Member",
    description: "Participates in workspace tasks, conversations, and check-ins.",
    badgeBackground: "#F1EEF8",
    badgeText: "#5b5675",
  },
  admin: {
    label: "Admin",
    shortLabel: "Admin",
    description: "Legacy administrator access. This role is read-only here.",
    badgeBackground: "#FFF4E5",
    badgeText: "#A45A07",
  },
};

export const EDITABLE_WORKSPACE_ROLES: readonly EditableWorkspaceRole[] = [
  "member",
  "team_leader",
];

export function getWorkspaceRolePresentation(
  role: TeamRole,
): WorkspaceRolePresentation {
  return ROLE_PRESENTATION[role];
}

export function canEditWorkspacePermissionTarget({
  viewerRole,
  targetRole,
}: {
  viewerRole?: TeamRole | null;
  targetRole: TeamRole;
}): boolean {
  return (
    viewerRole === "owner" &&
    (targetRole === "member" || targetRole === "team_leader")
  );
}

function memberSortLabel(member: TeamMember): string {
  return member.user.name.trim() || member.user.email.trim();
}

export function sortWorkspacePermissionMembers(
  members: readonly TeamMember[],
): TeamMember[] {
  return [...members].sort((left, right) => {
    const byName = memberSortLabel(left).localeCompare(
      memberSortLabel(right),
      undefined,
      { sensitivity: "base" },
    );
    if (byName !== 0) return byName;
    return left.user.email.localeCompare(right.user.email, undefined, {
      sensitivity: "base",
    });
  });
}
