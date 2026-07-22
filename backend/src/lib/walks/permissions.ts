import { prisma } from "../../prisma";
import { userCanManageEnterpriseOrgTeam } from "../enterprise-org-access";
import { getWorkspaceModuleAssignmentPermissions } from "../org-go/modules";

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
  if (await userCanManageEnterpriseOrgTeam(userId, teamId)) {
    return { ok: true, membership: { role: "org_admin", userId } };
  }
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
  if (await userCanManageEnterpriseOrgTeam(userId, teamId)) {
    return { ok: true, membership: { role: "org_admin", userId } };
  }
  const membership = await getWalkMembership(teamId, userId);
  if (!membership) return { ok: false, status: 403, message: "Not a team member" };
  if (!canViewWalks(membership.role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return { ok: true, membership: { role: membership.role, userId: membership.userId } };
}

/**
 * Enterprise workspace managers may not edit templates / org library unless assignment allows.
 * Org admins always can. Self-serve teams are unrestricted (assigned: false).
 */
export async function assertCanEditWalkStandards(
  teamId: string,
  userId: string,
): Promise<
  | { ok: true; allowTemplateEdits: boolean; enterprise: boolean }
  | { ok: false; status: 403; message: string }
> {
  const manage = await assertCanManageWalks(teamId, userId);
  if (!manage.ok) return manage;

  const perms = await getWorkspaceModuleAssignmentPermissions(teamId, "temp-checks");
  if (!perms.assigned) {
    return { ok: true, allowTemplateEdits: true, enterprise: false };
  }
  if (manage.membership.role === "org_admin") {
    return { ok: true, allowTemplateEdits: true, enterprise: true };
  }
  if (!perms.allowTemplateEdits) {
    return {
      ok: false,
      status: 403,
      message: "Corporate standards are locked. Contact your organization admin to change templates or the item library.",
    };
  }
  return { ok: true, allowTemplateEdits: true, enterprise: true };
}

export async function getEnterpriseConfigureFlags(teamId: string) {
  const perms = await getWorkspaceModuleAssignmentPermissions(teamId, "temp-checks");
  if (!perms.assigned) {
    return {
      enterpriseAssigned: false as const,
      allowScheduleEdits: true,
      allowEquipmentAdditions: true,
      allowLocalNotes: true,
      allowLocalNotifications: true,
      allowTemplateEdits: true,
    };
  }
  return {
    enterpriseAssigned: true as const,
    allowScheduleEdits: perms.allowScheduleEdits,
    allowEquipmentAdditions: perms.allowEquipmentAdditions,
    allowLocalNotes: perms.allowLocalNotes,
    allowLocalNotifications: perms.allowLocalNotifications,
    allowTemplateEdits: perms.allowTemplateEdits,
  };
}
