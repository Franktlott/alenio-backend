import { prisma } from "../../prisma";

export async function getWalkMembership(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

/** Create/edit/publish walks — same bar as workspace module manage. */
export function canManageWalks(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export function canViewWalks(role: string): boolean {
  return (
    role === "owner" ||
    role === "team_leader" ||
    role === "admin" ||
    role === "member"
  );
}

export async function assertCanManageWalks(
  teamId: string,
  userId: string,
): Promise<{ ok: true; membership: { role: string; userId: string } } | { ok: false; status: 403 | 404; message: string }> {
  const membership = await getWalkMembership(teamId, userId);
  if (!membership) return { ok: false, status: 403, message: "Not a team member" };
  if (!canManageWalks(membership.role)) {
    return { ok: false, status: 403, message: "Only owners and team leaders can manage walks" };
  }
  return { ok: true, membership: { role: membership.role, userId: membership.userId } };
}

export async function assertCanViewWalks(
  teamId: string,
  userId: string,
): Promise<{ ok: true; membership: { role: string; userId: string } } | { ok: false; status: 403; message: string }> {
  const membership = await getWalkMembership(teamId, userId);
  if (!membership) return { ok: false, status: 403, message: "Not a team member" };
  if (!canViewWalks(membership.role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return { ok: true, membership: { role: membership.role, userId: membership.userId } };
}
