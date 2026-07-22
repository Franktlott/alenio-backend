import { prisma } from "../prisma";
import { sendPushToUsers } from "./push";
import { ensureTeamGoHubToken } from "./go-hub";

export function normalizeWorkspaceCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function findTeamByInviteCode<T extends { id: string }>(
  code: string,
  select: Record<string, true>,
): Promise<T | null> {
  const normalized = normalizeWorkspaceCode(code);
  if (!normalized) return null;

  const exact = await prisma.team.findUnique({
    where: { inviteCode: normalized },
    select,
  });
  if (exact) return exact as T;

  const insensitive = await prisma.team.findFirst({
    where: { inviteCode: { equals: normalized, mode: "insensitive" } },
    select,
  });
  return (insensitive as T | null) ?? null;
}

/** Owners and team leaders can approve Alenio Go device links.
 * Enterprise org owners/admins can manage Go for every workspace in their org.
 */
export async function canManageGoLoginRequests(teamId: string, userId: string): Promise<boolean> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (membership && (membership.role === "owner" || membership.role === "team_leader")) {
    return true;
  }
  const { userCanManageEnterpriseOrgTeam } = await import("./enterprise-org-access");
  return userCanManageEnterpriseOrgTeam(userId, teamId);
}

export async function notifyGoLoginApprovers(
  teamId: string,
  teamName: string,
  deviceLabel: string,
  requestId: string,
): Promise<void> {
  const approvers = await prisma.teamMember.findMany({
    where: { teamId, role: { in: ["owner", "team_leader"] } },
    select: { userId: true },
  });
  const approverIds = approvers.map((a) => a.userId);
  if (approverIds.length === 0) return;

  await sendPushToUsers(
    approverIds,
    "Alenio Go login",
    `${deviceLabel} wants to connect to ${teamName}`,
    { teamId, type: "go_login_request", requestId },
    undefined,
    teamId,
  );
}

export async function getGoLoginHubTokenForRequest(teamId: string, requestId: string) {
  const request = await prisma.goLoginRequest.findUnique({
    where: { id: requestId },
    include: { team: { select: { name: true } } },
  });
  if (!request || request.teamId !== teamId || request.status !== "approved") {
    return null;
  }
  const hubToken = await ensureTeamGoHubToken(teamId);
  return { hubToken, teamName: request.team.name };
}

export async function approveGoLoginRequest(teamId: string, requestId: string, approverUserId: string) {
  const request = await prisma.goLoginRequest.findUnique({
    where: { id: requestId },
    include: { team: { select: { name: true } } },
  });
  if (!request || request.teamId !== teamId) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }
  if (request.status !== "pending") {
    return { ok: false as const, code: "CONFLICT" as const };
  }

  const hubToken = await ensureTeamGoHubToken(teamId);
  await prisma.goLoginRequest.update({
    where: { id: requestId },
    data: { status: "approved", approvedByUserId: approverUserId },
  });

  return {
    ok: true as const,
    hubToken,
    teamName: request.team.name,
    deviceId: request.deviceId,
  };
}
