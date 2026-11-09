import { createEmailPasswordUser } from "../auth";
import { env } from "../env";
import { deleteAppUserCompletely } from "./delete-app-user";
import { isPlatformAdminEligibleEmail, platformAdminEmails } from "./platform-admin-allowlist";
import { isPrismaUniqueOnName, isTeamNameTakenForUser, normalizeTeamName } from "./team-name";
import { resolveTimeZone } from "./timezone";
import { prisma } from "../prisma";
import { effectiveStaffRole, STAFF_ROLES, type StaffRole } from "./staff-roles";

const VALID_PLANS = new Set(["team", "pro", "operations"]);
const VALID_STATUSES = new Set(["active", "canceled", "past_due", "trialing", "expired"]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createPlatformUser(input: {
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
}) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 200);
  const password = input.password;
  if (!email || !name || password.length < 8) {
    return { ok: false as const, code: "VALIDATION" as const };
  }
  if (input.isAdmin) {
    return { ok: false as const, code: "REGULAR_ACCOUNT" as const };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false as const, code: "EMAIL_TAKEN" as const };

  const created = await createEmailPasswordUser(email, password, name);
  if (!created) return { ok: false as const, code: "AUTH_FAILED" as const };

  // Prefer the Neon Auth user id so login sync binds to this same row (and keeps isAdmin).
  let authId: string | null = null;
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM neon_auth."user" WHERE email = ${email} LIMIT 1
    `;
    authId = rows[0]?.id ?? null;
  } catch (err) {
    console.warn("[admin-platform] neon_auth lookup failed:", err);
  }

  const user = await prisma.user.create({
    data: {
      id: authId ?? crypto.randomUUID(),
      email,
      name,
      emailVerified: true,
      accountType: "member",
      isAdmin: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      isAdmin: true,
    },
  });

  const { notifyAdminsNewUser } = await import("./admin-push");
  void notifyAdminsNewUser(user).catch((err) =>
    console.warn("[admin-platform] admin push on user create failed", err),
  );

  return { ok: true as const, user };
}

export type StaffRoleChangeError =
  | "DOMAIN_NOT_ALLOWED"
  | "SELF_CHANGE"
  | "ALLOWLISTED"
  | "LAST_SUPER_ADMIN";

/**
 * The rules for giving out or taking away staff access, kept free of the
 * database so they can be tested directly.
 * - Only company-domain emails can hold any staff role.
 * - Nobody can change their own role, so no one can raise their own access.
 * - Emails pinned in PLATFORM_ADMIN_EMAILS stay Super Admin (startup would restore them anyway).
 * - Alenio always keeps at least one Super Admin.
 */
export function checkStaffRoleChange(params: {
  actorId: string;
  target: { id: string; email: string | null; accountType: string; staffRole: string | null };
  nextRole: StaffRole | null;
  superAdminCount: number;
  pinnedEmails: string[];
}): StaffRoleChangeError | null {
  const { actorId, target, nextRole } = params;
  const currentRole = effectiveStaffRole(target);
  if (currentRole === nextRole) return null;
  if (target.id === actorId) return "SELF_CHANGE";
  if (nextRole === "super_admin" && !isPlatformAdminEligibleEmail(target.email)) return "DOMAIN_NOT_ALLOWED";
  if (currentRole === "super_admin") {
    if (params.pinnedEmails.includes(normalizeEmail(target.email ?? ""))) return "ALLOWLISTED";
    if (params.superAdminCount <= 1) return "LAST_SUPER_ADMIN";
  }
  return null;
}

export type UserEmailChangeError = "EMAIL_CHANGE_COMPANY_ONLY" | "SUPER_ADMIN_EMAIL_DOMAIN";

/**
 * Changing someone's email lets the new address reset their password, so only company
 * staff can do it, and a Super Admin's email must stay on the company domain.
 */
export function checkUserEmailChange(params: {
  actorEmail: string | null;
  target: { email: string | null; accountType: string; staffRole: string | null };
  nextEmail: string;
}): UserEmailChangeError | null {
  if (normalizeEmail(params.nextEmail) === normalizeEmail(params.target.email ?? "")) return null;
  if (!isPlatformAdminEligibleEmail(params.actorEmail)) return "EMAIL_CHANGE_COMPANY_ONLY";
  if (effectiveStaffRole(params.target) === "super_admin" && !isPlatformAdminEligibleEmail(params.nextEmail)) {
    return "SUPER_ADMIN_EMAIL_DOMAIN";
  }
  return null;
}

const STAFF_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  createdAt: true,
  accountType: true,
  staffRole: true,
} as const;

/** Gives a user a staff role, changes it, or (null) returns them to a regular member account. */
export async function setStaffRole(actorId: string, userId: string, nextRole: StaffRole | null) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, accountType: true, staffRole: true },
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const superAdminCount = await prisma.user.count({
    where: {
      accountType: "platform_admin",
      OR: [{ staffRole: null }, { staffRole: "super_admin" }, { staffRole: { notIn: [...STAFF_ROLES] } }],
    },
  });
  const error = checkStaffRoleChange({
    actorId,
    target: existing,
    nextRole,
    superAdminCount,
    pinnedEmails: platformAdminEmails(env.PLATFORM_ADMIN_EMAILS),
  });
  if (error) return { ok: false as const, code: error };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      accountType: nextRole ? "platform_admin" : "member",
      staffRole: nextRole,
      // Legacy flag kept in sync for older readers.
      isAdmin: nextRole !== null,
    },
    select: STAFF_USER_SELECT,
  });
  return {
    ok: true as const,
    user: withIsAdmin(user),
    previousRole: effectiveStaffRole(existing),
  };
}

/** Older admin toggle: on keeps any existing staff role (or grants Super Admin), off removes staff access. */
export async function setPlatformAdmin(actorId: string, userId: string, isAdmin: boolean) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountType: true, staffRole: true },
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  const nextRole = isAdmin ? (effectiveStaffRole(existing) ?? "super_admin") : null;
  return setStaffRole(actorId, userId, nextRole);
}

/** Admin status follows accountType; expose it as `isAdmin` (and the staff role) for API consumers. */
export function withIsAdmin<T extends { accountType: string; staffRole?: string | null }>(
  row: T,
): Omit<T, "accountType" | "staffRole"> & { isAdmin: boolean; staffRole: StaffRole | null } {
  const { accountType, staffRole, ...rest } = row;
  return { ...rest, isAdmin: accountType === "platform_admin", staffRole: effectiveStaffRole({ accountType, staffRole }) };
}

export async function listPlatformTeams(limit = 200) {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      inviteCode: true,
      timezone: true,
      createdAt: true,
      organizationId: true,
      organization: {
        select: { id: true, name: true, accountType: true },
      },
      subscription: {
        select: {
          plan: true,
          status: true,
          stripeCustomerId: true,
          currentPeriodEnd: true,
        },
      },
      members: {
        where: { role: "owner" },
        take: 1,
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: {
        select: {
          members: true,
          tasks: { where: { kind: "workspace_task" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return teams.map((team) => {
    const isEnterprise =
      Boolean(team.organizationId && team.organization) &&
      (team.organization?.accountType || "enterprise") === "enterprise";
    return {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      timezone: team.timezone,
      createdAt: team.createdAt.toISOString(),
      memberCount: team._count.members,
      taskCount: team._count.tasks,
      owner: team.members[0]?.user ?? null,
      /** "enterprise" = linked to a contract Organization. "self_serve" = Stripe/plan only (or workspace SSO org). */
      billingChannel: isEnterprise ? ("enterprise" as const) : ("self_serve" as const),
      organization: isEnterprise && team.organization
        ? {
            id: team.organization.id,
            name: team.organization.name,
            accountType: team.organization.accountType || "enterprise",
          }
        : null,
      subscription: team.subscription
        ? {
            plan: team.subscription.plan,
            status: team.subscription.status,
            stripeCustomerId: team.subscription.stripeCustomerId,
            currentPeriodEnd: team.subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : { plan: "legacy", status: "active", stripeCustomerId: null, currentPeriodEnd: null },
    };
  });
}

export async function getPlatformTeam(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      timezone: true,
      createdAt: true,
      subscription: true,
      members: {
        select: {
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true, createdAt: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      _count: {
        select: {
          members: true,
          tasks: { where: { kind: "workspace_task" } },
          messages: true,
        },
      },
    },
  });
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    team: {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      timezone: team.timezone,
      createdAt: team.createdAt.toISOString(),
      memberCount: team._count.members,
      taskCount: team._count.tasks,
      messageCount: team._count.messages,
      subscription: team.subscription,
      members: team.members.map((m) => ({
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
      })),
    },
  };
}

export async function updateTeamSubscription(
  teamId: string,
  input: { plan?: string; status?: string },
) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const plan = input.plan?.trim().toLowerCase();
  const status = input.status?.trim().toLowerCase();
  if (plan && !VALID_PLANS.has(plan)) return { ok: false as const, code: "VALIDATION" as const };
  if (status && !VALID_STATUSES.has(status)) return { ok: false as const, code: "VALIDATION" as const };

  const normalizedPlan = plan === "pro" ? "team" : plan;

  const previous = await prisma.teamSubscription.findUnique({
    where: { teamId },
    select: { plan: true, status: true, team: { select: { name: true } } },
  });

  const subscription = await prisma.teamSubscription.upsert({
    where: { teamId },
    create: {
      teamId,
      plan: normalizedPlan ?? "team",
      status: status ?? "active",
    },
    update: {
      ...(normalizedPlan ? { plan: normalizedPlan } : {}),
      ...(status ? { status: status } : {}),
    },
    include: { team: { select: { name: true } } },
  });

  const { notifyAdminsBillingChange } = await import("./admin-push");
  void notifyAdminsBillingChange({
    teamId,
    teamName: subscription.team.name,
    plan: subscription.plan,
    status: subscription.status,
    previousPlan: previous?.plan,
    previousStatus: previous?.status,
  }).catch((err) => console.warn("[admin-platform] billing push failed", err));

  return { ok: true as const, subscription };
}

export async function createEnterpriseAccount(input: {
  teamName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword?: string;
  plan?: string;
  /**
   * When false, create the workspace + subscription without adding the contact as a TeamMember.
   * Used for enterprise org owners (org-level only). Default true for standalone admin workspace create.
   */
  addOwnerAsTeamMember?: boolean;
}) {
  const teamName = normalizeTeamName(input.teamName);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const ownerName = input.ownerName.trim().slice(0, 200);
  const planRaw = input.plan?.trim().toLowerCase() ?? "team";
  const plan = planRaw === "pro" ? "team" : planRaw;
  const addOwnerAsTeamMember = input.addOwnerAsTeamMember !== false;
  if (!VALID_PLANS.has(plan)) return { ok: false as const, code: "VALIDATION" as const };
  if (!teamName || !ownerEmail || !ownerName) return { ok: false as const, code: "VALIDATION" as const };

  let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    if (!input.ownerPassword || input.ownerPassword.length < 8) {
      return { ok: false as const, code: "PASSWORD_REQUIRED" as const };
    }
    const created = await createPlatformUser({
      email: ownerEmail,
      name: ownerName,
      password: input.ownerPassword,
    });
    if (!created.ok) return created;
    owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) return { ok: false as const, code: "AUTH_FAILED" as const };
  }

  if (await isTeamNameTakenForUser(teamName, owner.id)) {
    return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
  }

  let inviteCode = generateInviteCode();
  while (await prisma.team.findUnique({ where: { inviteCode } })) {
    inviteCode = generateInviteCode();
  }

  try {
    const team = await prisma.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          name: teamName,
          inviteCode,
          timezone: resolveTimeZone(owner.timezone),
          ...(addOwnerAsTeamMember
            ? { members: { create: { userId: owner!.id, role: "owner" } } }
            : {}),
        },
      });
      await tx.teamSubscription.create({
        data: { teamId: createdTeam.id, plan, status: "active" },
      });
      return createdTeam;
    });

    const { notifyAdminsNewWorkspace, notifyAdminsBillingChange } = await import("./admin-push");
    void notifyAdminsNewWorkspace({
      id: team.id,
      name: team.name,
      ownerName: owner.name,
    }).catch((err) => console.warn("[admin-platform] workspace push failed", err));
    void notifyAdminsBillingChange({
      teamId: team.id,
      teamName: team.name,
      plan,
      status: "active",
      previousPlan: "legacy",
      previousStatus: "canceled",
    }).catch((err) => console.warn("[admin-platform] billing push failed", err));

    return {
      ok: true as const,
      team: {
        id: team.id,
        name: team.name,
        inviteCode: team.inviteCode,
        timezone: team.timezone,
      },
      owner: { id: owner.id, name: owner.name, email: owner.email },
      plan,
    };
  } catch (err) {
    if (isPrismaUniqueOnName(err)) {
      return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };
    }
    throw err;
  }
}

export async function deletePlatformUser(actorId: string, targetUserId: string) {
  if (targetUserId === actorId) {
    return { ok: false as const, code: "SELF_DELETE" as const };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, accountType: true },
  });
  if (!targetUser) return { ok: false as const, code: "NOT_FOUND" as const };
  if (targetUser.accountType === "platform_admin") return { ok: false as const, code: "ADMIN_DELETE" as const };

  await deleteAppUserCompletely(targetUserId);
  return { ok: true as const };
}
