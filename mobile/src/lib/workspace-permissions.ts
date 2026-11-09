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
    badgeBackground: "#E9EDFF",
    badgeText: "#3348B8",
  },
  team_leader: {
    label: "Team Leader",
    shortLabel: "Leader",
    description: "Leads day-to-day work and supports workspace members.",
    badgeBackground: "#EEF2FF",
    badgeText: "#4361EE",
  },
  member: {
    label: "Member",
    shortLabel: "Member",
    description: "Participates in workspace tasks, conversations, and check-ins.",
    badgeBackground: "#F1F5F9",
    badgeText: "#526174",
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
