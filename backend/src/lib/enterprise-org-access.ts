import { prisma } from "../prisma";
import { isPrismaUniqueOnName, isTeamDisplayNameTaken, normalizeTeamName } from "./team-name";

const ORG_GO_ADMIN_ROLES = new Set(["org_owner", "org_admin"]);
const PAID_ACTIVE_STATUSES = ["active", "trialing", "past_due", "incomplete", "paused"] as const;
const DEFAULT_WORKSPACE_LIMIT = 5;

/**
 * Enterprise org owners/admins manage the contract at org level.
 * They must not be TeamMembers of that org's workspaces.
 */
export async function detachEnterpriseOrgAdminsFromOrgWorkspaces(organizationId: string) {
  const admins = await prisma.organizationMembership.findMany({
    where: {
      organizationId,
      role: { in: [...ORG_GO_ADMIN_ROLES] },
    },
    select: { userId: true },
  });
  const userIds = admins.map((a) => a.userId);
  if (userIds.length === 0) return { removed: 0 };

  const result = await prisma.teamMember.deleteMany({
    where: {
      userId: { in: userIds },
      team: { organizationId },
    },
  });
  return { removed: result.count };
}

/**
 * Detach org owners/admins from all enterprise org workspaces (cleanup for already-assigned owners).
 */
export async function detachAllEnterpriseOrgAdminsFromWorkspaces() {
  const orgs = await prisma.organization.findMany({
    where: { accountType: "enterprise" },
    select: { id: true },
  });
  let removed = 0;
  for (const org of orgs) {
    const r = await detachEnterpriseOrgAdminsFromOrgWorkspaces(org.id);
    removed += r.removed;
  }
  return { organizations: orgs.length, removed };
}

function subscriptionHasGoFeatures(sub: { plan: string; status: string } | null | undefined): boolean {
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  const status = (sub?.status ?? "active").trim().toLowerCase();
  if (plan !== "operations") return false;
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export type EnterpriseOrgForUser = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  role: string;
  workspaceLimit: number;
  workspaceCount: number;
  canCreateWorkspaces: boolean;
  teams: Array<{
    id: string;
    name: string;
    inviteCode: string | null;
    hasGoFeatures: boolean;
  }>;
};

/** Enterprise contract orgs the user belongs to, with all linked workspaces. */
export async function listEnterpriseOrganizationsForUser(userId: string): Promise<EnterpriseOrgForUser[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      organization: { accountType: "enterprise" },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          accountType: true,
          status: true,
          workspaceLimit: true,
          teams: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              inviteCode: true,
              subscription: { select: { plan: true, status: true } },
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships
    .filter((m) => m.organization.status === "active")
    .map((m) => {
      const workspaceLimit = m.organization.workspaceLimit ?? DEFAULT_WORKSPACE_LIMIT;
      const workspaceCount = m.organization.teams.length;
      const canCreateWorkspaces =
        ORG_GO_ADMIN_ROLES.has(m.role) && workspaceCount < workspaceLimit;
      return {
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        accountType: m.organization.accountType || "enterprise",
        role: m.role,
        workspaceLimit,
        workspaceCount,
        canCreateWorkspaces,
        teams: m.organization.teams.map((t) => ({
          id: t.id,
          name: t.name,
          inviteCode: t.inviteCode,
          hasGoFeatures: subscriptionHasGoFeatures(t.subscription),
        })),
      };
    });
}

/** Org owner/admin can manage Alenio Go for any workspace linked to their enterprise org. */
export async function userCanManageEnterpriseOrgTeam(
  userId: string,
  teamId: string,
): Promise<boolean> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      organizationId: true,
      organization: { select: { accountType: true, status: true } },
    },
  });
  if (!team?.organizationId || !team.organization) return false;
  if (team.organization.accountType !== "enterprise") return false;
  if (team.organization.status !== "active") return false;

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: { organizationId: team.organizationId, userId },
    },
    select: { role: true },
  });
  if (!membership) return false;
  return ORG_GO_ADMIN_ROLES.has(membership.role);
}

/**
 * Enterprise org owner/admin creates a workspace under their org (subject to Alenio-set cap).
 * New workspaces get Operations features by default for Go.
 */
export async function createOrganizationWorkspace(input: {
  organizationId: string;
  userId: string;
  name: string;
  plan?: string;
}) {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { role: true },
  });
  if (!membership || !ORG_GO_ADMIN_ROLES.has(membership.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      accountType: true,
      status: true,
      workspaceLimit: true,
      defaultTeamId: true,
      _count: { select: { teams: true } },
    },
  });
  if (!org || org.accountType !== "enterprise" || org.status !== "active") {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  const limit = org.workspaceLimit ?? DEFAULT_WORKSPACE_LIMIT;
  if (org._count.teams >= limit) {
    return {
      ok: false as const,
      code: "WORKSPACE_LIMIT" as const,
      workspaceLimit: limit,
      workspaceCount: org._count.teams,
    };
  }

  const teamName = normalizeTeamName(input.name);
  if (!teamName) return { ok: false as const, code: "VALIDATION" as const };
  if (await isTeamDisplayNameTaken(teamName)) {
    return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
  }

  const planRaw = (input.plan ?? "operations").trim().toLowerCase();
  const plan = planRaw === "pro" ? "team" : planRaw;
  if (!["free", "team", "operations"].includes(plan)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  let inviteCode = generateInviteCode();
  while (await prisma.team.findUnique({ where: { inviteCode } })) {
    inviteCode = generateInviteCode();
  }

  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: teamName,
          inviteCode,
          organizationId: org.id,
          // Org admins are not workspace members — they manage via org role.
        },
      });
      await tx.teamSubscription.create({
        data: { teamId: created.id, plan, status: "active" },
      });
      if (!org.defaultTeamId) {
        await tx.organization.update({
          where: { id: org.id },
          data: { defaultTeamId: created.id },
        });
      }
      return created;
    });

    const owner = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    const { notifyAdminsNewWorkspace } = await import("./admin-push");
    void notifyAdminsNewWorkspace({
      id: team.id,
      name: team.name,
      ownerName: owner?.name ?? null,
    }).catch((err) => console.warn("[enterprise-org] workspace push failed", err));

    return {
      ok: true as const,
      team: {
        id: team.id,
        name: team.name,
        inviteCode: team.inviteCode,
        hasGoFeatures: plan === "operations",
      },
      workspaceLimit: limit,
      workspaceCount: org._count.teams + 1,
    };
  } catch (err) {
    if (isPrismaUniqueOnName(err)) {
      return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
    }
    console.error("[enterprise-org] create workspace failed:", err);
    return { ok: false as const, code: "CREATE_FAILED" as const };
  }
}

async function requireOrgAdminForOrg(userId: string, organizationId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  if (!membership || !ORG_GO_ADMIN_ROLES.has(membership.role)) return null;
  return membership;
}

/** Rename a workspace that belongs to the enterprise org. */
export async function renameOrganizationWorkspace(input: {
  organizationId: string;
  teamId: string;
  userId: string;
  name: string;
}) {
  if (!(await requireOrgAdminForOrg(input.userId, input.organizationId))) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, accountType: true, status: true },
  });
  if (!org || org.accountType !== "enterprise" || org.status !== "active") {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, name: true, inviteCode: true, organizationId: true },
  });
  if (!team || team.organizationId !== input.organizationId) {
    return { ok: false as const, code: "TEAM_NOT_FOUND" as const };
  }

  const teamName = normalizeTeamName(input.name);
  if (!teamName) return { ok: false as const, code: "VALIDATION" as const };

  if (teamName.toLowerCase() !== team.name.trim().toLowerCase()) {
    if (await isTeamDisplayNameTaken(teamName)) {
      return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
    }
  }

  try {
    const updated = await prisma.team.update({
      where: { id: team.id },
      data: { name: teamName },
      select: { id: true, name: true, inviteCode: true },
    });
    return { ok: true as const, team: updated };
  } catch (err) {
    if (isPrismaUniqueOnName(err)) {
      return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
    }
    console.error("[enterprise-org] rename workspace failed:", err);
    return { ok: false as const, code: "UPDATE_FAILED" as const };
  }
}

/** Permanently delete a workspace that belongs to the enterprise org. */
export async function deleteOrganizationWorkspace(input: {
  organizationId: string;
  teamId: string;
  userId: string;
}) {
  if (!(await requireOrgAdminForOrg(input.userId, input.organizationId))) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, accountType: true, status: true, defaultTeamId: true },
  });
  if (!org || org.accountType !== "enterprise" || org.status !== "active") {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!team || team.organizationId !== input.organizationId) {
    return { ok: false as const, code: "TEAM_NOT_FOUND" as const };
  }

  try {
    if (org.defaultTeamId === team.id) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { defaultTeamId: null },
      });
    }
    const { deleteWorkspaceCompletely } = await import("./delete-workspace");
    await deleteWorkspaceCompletely(team.id);
    return { ok: true as const, deletedTeamId: team.id, deletedName: team.name };
  } catch (err) {
    console.error("[enterprise-org] delete workspace failed:", err);
    return { ok: false as const, code: "DELETE_FAILED" as const };
  }
}
