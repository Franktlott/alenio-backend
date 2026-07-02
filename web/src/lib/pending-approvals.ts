import type { WebGoLoginRequest, WebTeamJoinRequest } from "./api";

export type PendingJoinRow = WebTeamJoinRequest & { teamName: string };
export type PendingGoLoginRow = WebGoLoginRequest & { teamName: string };

export function canManageApprovals(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export function joinRequesterLabel(user: WebTeamJoinRequest["user"]): string {
  return user.name?.trim() || user.email?.trim() || "Someone";
}

export function formatApprovalDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function approvalBusyKey(kind: "join" | "go", teamId: string, requestId: string): string {
  return `${kind}:${teamId}:${requestId}`;
}
