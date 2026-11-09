import type { TeamMember, TeamRole } from "@/lib/types";

export type WorkspaceMemberFilter = "all" | "admins" | "team_leader" | "member";
export type WorkspaceInviteRole = "member" | "team_leader";

export function parseInviteEmails(value: string): string[] {
  return [...new Set(
    value
      .split(/[,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export function workspaceMemberCounts(members: readonly TeamMember[]) {
  return {
    all: members.length,
    admins: members.filter((member) => member.role === "owner" || member.role === "admin").length,
    team_leader: members.filter((member) => member.role === "team_leader").length,
    member: members.filter((member) => member.role === "member").length,
  };
}

export function matchesWorkspaceMemberFilter(
  member: TeamMember,
  filter: WorkspaceMemberFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "admins") return member.role === "owner" || member.role === "admin";
  return member.role === filter;
}

export function canBulkManageWorkspaceMember(
  viewerRole: TeamRole | string | null | undefined,
  target: TeamMember,
  viewerUserId?: string | null,
): boolean {
  if (target.userId === viewerUserId) return false;
  if (viewerRole === "owner") {
    return target.role === "member" || target.role === "team_leader";
  }
  return viewerRole === "team_leader" && target.role === "member";
}

export function canBulkRemoveWorkspaceMember(
  viewerRole: TeamRole | string | null | undefined,
  target: TeamMember,
  viewerUserId?: string | null,
): boolean {
  if (target.userId === viewerUserId) return false;
  return (viewerRole === "owner" || viewerRole === "team_leader") && target.role === "member";
}
