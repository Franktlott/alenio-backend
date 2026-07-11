import { createEmailPasswordUser } from "../auth";
import { deleteAppUserCompletely } from "./delete-app-user";
import { isPrismaUniqueOnName, normalizeTeamName } from "./team-name";
import { prisma } from "../prisma";

const VALID_PLANS = new Set(["free", "team", "pro"]);
const VALID_STATUSES = new Set(["active", "canceled", "past_due", "trialing"]);

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
      isAdmin: input.isAdmin === true,
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

export async function setPlatformAdmin(userId: string, isAdmin: boolean) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
    select: { id: true, name: true, email: true, isAdmin: true },
  });

  return { ok: true as const, user };
}

export async function listPlatformTeams(limit = 200) {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      inviteCode: true,
      createdAt: true,
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
      _count: { select: { members: true, tasks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    inviteCode: team.inviteCode,
    createdAt: team.createdAt.toISOString(),
    memberCount: team._count.members,
    taskCount: team._count.tasks,
    owner: team.members[0]?.user ?? null,
    subscription: team.subscription
      ? {
          plan: team.subscription.plan,
          status: team.subscription.status,
          stripeCustomerId: team.subscription.stripeCustomerId,
          currentPeriodEnd: team.subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : { plan: "free", status: "active", stripeCustomerId: null, currentPeriodEnd: null },
  }));
}

export async function getPlatformTeam(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      inviteCode: true,
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
      _count: { select: { members: true, tasks: true, messages: true } },
    },
  });
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    team: {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
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
      ...(status ? { status } : {}),
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
}) {
  const teamName = normalizeTeamName(input.teamName);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const ownerName = input.ownerName.trim().slice(0, 200);
  const planRaw = input.plan?.trim().toLowerCase() ?? "team";
  const plan = planRaw === "pro" ? "team" : planRaw;
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

  const nameTaken = await prisma.team.findFirst({
    where: { name: { equals: teamName, mode: "insensitive" } },
    select: { id: true },
  });
  if (nameTaken) return { ok: false as const, code: "TEAM_NAME_TAKEN" as const };

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
          members: { create: { userId: owner!.id, role: "owner" } },
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
    if (plan !== "free") {
      void notifyAdminsBillingChange({
        teamId: team.id,
        teamName: team.name,
        plan,
        status: "active",
        previousPlan: "free",
        previousStatus: "canceled",
      }).catch((err) => console.warn("[admin-platform] billing push failed", err));
    }

    return {
      ok: true as const,
      team: {
        id: team.id,
        name: team.name,
        inviteCode: team.inviteCode,
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

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) return { ok: false as const, code: "NOT_FOUND" as const };
  if (targetUser.isAdmin) return { ok: false as const, code: "ADMIN_DELETE" as const };

  await deleteAppUserCompletely(targetUserId);
  return { ok: true as const };
}
