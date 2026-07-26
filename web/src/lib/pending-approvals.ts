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

/** e.g. "Expires Jul 31" or "Expires today" for ownership transfer windows. */
export function formatOwnershipExpiry(iso: string): string {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return "Expires soon";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((startOfEnd.getTime() - startOfToday.getTime()) / dayMs);
  const dateLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (days < 0) return `Expired ${dateLabel}`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 7) return `Expires in ${days} days (${dateLabel})`;
  return `Expires ${dateLabel}`;
}

export function approvalBusyKey(
  kind: "join" | "go" | "ownership",
  teamId: string,
  requestId: string,
): string {
  return `${kind}:${teamId}:${requestId}`;
}
