import { prisma } from "../prisma";
import { normalizeEmailDomain, uniqueOrgSlug } from "./organization-sso";
import { createEnterpriseAccount } from "./admin-platform";
import { sendEnterpriseWelcomeEmail } from "./enterprise-welcome-email";
import {
  createOrganizationSignupInvite,
  sendEnterpriseSignupEmail,
} from "./enterprise-signup-invite";

export type AdminOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  /** Always "enterprise" — Organization rows are contract customers, not Stripe self-serve. */
  accountType: string;
  ssoRequired: boolean;
  createdAt: Date;
  workspaceCount: number;
  memberCount: number;
  domain: string | null;
  domainVerified: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  defaultTeam: { id: string; name: string } | null;
};

export async function listAdminOrganizations(): Promise<AdminOrganizationRow[]> {
  // Contract customers only — workspace SSO orgs (accountType "workspace") stay off this list.
  const orgs = await prisma.organization.findMany({
    where: { accountType: "enterprise" },
    orderBy: { createdAt: "desc" },
    include: {
      domains: { orderBy: { createdAt: "asc" }, take: 1 },
      ssoConfig: { select: { enabled: true } },
      scimConfig: { select: { enabled: true } },
      defaultTeam: { select: { id: true, name: true } },
      _count: {
        select: {
          teams: true,
          memberships: true,
        },
      },
    },
  });

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    accountType: org.accountType || "enterprise",
    ssoRequired: org.ssoRequired,
    createdAt: org.createdAt,
    workspaceCount: org._count.teams,
    memberCount: org._count.memberships,
    domain: org.domains[0]?.domain ?? null,
    domainVerified: Boolean(org.domains[0]?.verifiedAt),
    ssoEnabled: Boolean(org.ssoConfig?.enabled),
    scimEnabled: Boolean(org.scimConfig?.enabled),
    defaultTeam: org.defaultTeam,
  }));
}

export async function getAdminOrganization(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      domains: { orderBy: { createdAt: "asc" } },
      ssoConfig: {
        select: {
          provider: true,
          protocol: true,
          enabled: true,
          issuer: true,
          clientId: true,
        },
      },
      scimConfig: {
        select: {
          enabled: true,
          tokenPrefix: true,
        },
      },
      defaultTeam: { select: { id: true, name: true } },
      teams: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          inviteCode: true,
          createdAt: true,
          _count: { select: { members: true } },
          subscription: { select: { plan: true, status: true } },
        },
      },
      memberships: {
        orderBy: { joinedAt: "asc" },
        take: 50,
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!org) return null;
  return org;
}

export async function createAdminOrganization(input: {
  name: string;
  domain?: string;
  markDomainVerified?: boolean;
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
  initialWorkspaceName?: string;
  plan?: string;
}) {
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false as const, code: "VALIDATION" as const };

  const domain = input.domain ? normalizeEmailDomain(input.domain) : null;
  if (input.domain && !domain) return { ok: false as const, code: "INVALID_DOMAIN" as const };

  if (domain) {
    const taken = await prisma.organizationDomain.findUnique({ where: { domain }, select: { id: true } });
    if (taken) return { ok: false as const, code: "DOMAIN_TAKEN" as const };
  }

  let ownerUserId: string | null = null;
  let needsSignupInvite = false;
  const ownerEmail = input.ownerEmail?.trim().toLowerCase() || null;
  const ownerName =
    input.ownerName?.trim() ||
    (ownerEmail ? ownerEmail.split("@")[0] : "") ||
    null;

  if (ownerEmail) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      ownerUserId = existing.id;
    } else {
      needsSignupInvite = true;
    }
  }

  const slug = await uniqueOrgSlug(name);

  // Create first workspace only when the owner already has an Alenio account.
  // New owners get a signup invite and the workspace is created after they register.
  let createdWorkspace: { id: string; name: string; inviteCode: string } | null = null;
  let pendingWorkspaceName: string | null = null;
  let pendingPlan: string | null = null;

  if (input.initialWorkspaceName?.trim()) {
    if (!ownerEmail) {
      return { ok: false as const, code: "OWNER_REQUIRED_FOR_WORKSPACE" as const };
    }
    if (ownerUserId) {
      const workspace = await createEnterpriseAccount({
        teamName: input.initialWorkspaceName.trim(),
        ownerEmail,
        ownerName: ownerName || ownerEmail.split("@")[0] || "Owner",
        ownerPassword: input.ownerPassword,
        plan: input.plan,
      });
      if (!workspace.ok) return workspace;
      createdWorkspace = workspace.team;
      ownerUserId = workspace.owner.id;
    } else {
      pendingWorkspaceName = input.initialWorkspaceName.trim();
      pendingPlan = input.plan?.trim().toLowerCase() || "operations";
    }
  }

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name,
        slug,
        status: "active",
        accountType: "enterprise",
        defaultTeamId: createdWorkspace?.id ?? null,
        ...(domain
          ? {
              domains: {
                create: {
                  domain,
                  verifiedAt: input.markDomainVerified ? new Date() : null,
                },
              },
            }
          : {}),
        ...(ownerUserId
          ? {
              memberships: {
                create: {
                  userId: ownerUserId,
                  role: "org_owner",
                },
              },
            }
          : {}),
      },
    });

    if (createdWorkspace) {
      await tx.team.update({
        where: { id: createdWorkspace.id },
        data: { organizationId: created.id },
      });
    }

    return created;
  });

  let welcomeEmail: { sent: boolean; error?: string; kind?: "signup" | "welcome" } | null = null;
  if (ownerEmail && needsSignupInvite) {
    const invite = await createOrganizationSignupInvite({
      organizationId: org.id,
      email: ownerEmail,
      suggestedName: ownerName,
      pendingWorkspaceName,
      pendingPlan,
    });
    welcomeEmail = {
      ...(await sendEnterpriseSignupEmail({
        customerName: name,
        ownerEmail,
        suggestedName: ownerName,
        workspaceName: pendingWorkspaceName,
        token: invite.token,
      })),
      kind: "signup",
    };
  } else if (ownerEmail) {
    welcomeEmail = {
      ...(await sendEnterpriseWelcomeEmail({
        customerName: name,
        ownerName,
        ownerEmail,
        domain,
        workspaceName: createdWorkspace?.name ?? null,
      })),
      kind: "welcome",
    };
  }

  const detail = await getAdminOrganization(org.id);
  return { ok: true as const, organization: detail!, welcomeEmail };
}

export async function attachTeamToOrganization(organizationId: string, teamId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, defaultTeamId: true } });
  if (!org) return { ok: false as const, code: "ORG_NOT_FOUND" as const };

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, organizationId: true } });
  if (!team) return { ok: false as const, code: "TEAM_NOT_FOUND" as const };
  if (team.organizationId && team.organizationId !== organizationId) {
    return { ok: false as const, code: "TEAM_ALREADY_LINKED" as const };
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { organizationId },
  });

  if (!org.defaultTeamId) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { defaultTeamId: teamId },
    });
  }

  const detail = await getAdminOrganization(organizationId);
  return { ok: true as const, organization: detail! };
}

/**
 * Remove an enterprise customer record.
 * Linked workspaces are kept and unlinked (back to self-serve).
 */
export async function deleteAdminOrganization(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, defaultTeamId: true },
  });
  if (!org) return { ok: false as const, code: "NOT_FOUND" as const };

  const linkedTeams = await prisma.team.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: { defaultTeamId: null },
    });
    await tx.team.updateMany({
      where: { organizationId },
      data: { organizationId: null },
    });
    await tx.organization.delete({ where: { id: organizationId } });
  });

  return {
    ok: true as const,
    deleted: { id: org.id, name: org.name, slug: org.slug },
    unlinkedWorkspaces: linkedTeams,
  };
}

/** One-shot cleanup: demote a misclassified org by slug (keeps workspaces). */
export async function demoteOrganizationBySlug(slug: string) {
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!org) return { ok: false as const, code: "NOT_FOUND" as const };
  return deleteAdminOrganization(org.id);
}
