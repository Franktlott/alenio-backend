import { prisma } from "../prisma";

const ORG_GO_ADMIN_ROLES = new Set(["org_owner", "org_admin"]);
const PAID_ACTIVE_STATUSES = ["active", "trialing", "past_due", "incomplete", "paused"] as const;

function subscriptionHasGoFeatures(sub: { plan: string; status: string } | null | undefined): boolean {
  const plan = (sub?.plan ?? "free").trim().toLowerCase();
  const status = (sub?.status ?? "active").trim().toLowerCase();
  if (plan !== "operations") return false;
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export type EnterpriseOrgForUser = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  role: string;
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
    .map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      accountType: m.organization.accountType || "enterprise",
      role: m.role,
      teams: m.organization.teams.map((t) => ({
        id: t.id,
        name: t.name,
        inviteCode: t.inviteCode,
        hasGoFeatures: subscriptionHasGoFeatures(t.subscription),
      })),
    }));
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
