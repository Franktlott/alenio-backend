import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createEnterpriseAccount,
  createPlatformUser,
  deletePlatformUser,
  getPlatformTeam,
  listPlatformTeams,
  setPlatformAdmin,
  checkUserEmailChange,
  setStaffRole,
  updateTeamSubscription,
  withIsAdmin,
} from "../lib/admin-platform";
import { PLATFORM_ADMIN_EMAIL_DOMAIN } from "../lib/platform-admin-allowlist";
import {
  attachTeamToOrganization,
  createAdminOrganization,
  deleteAdminOrganization,
  getAdminOrganization,
  listAdminOrganizations,
  updateAdminOrganizationWorkspaceLimit,
} from "../lib/admin-organizations";
import { adminGuard, requireAbility, resolveStaffActor } from "../middleware/admin-guard";
import { listStaffActions, recordStaffAction, type StaffAuditEntry } from "../lib/staff-audit";
import { STAFF_ROLE_LABELS, STAFF_ROLES, roleHasAbility, type StaffRole } from "../lib/staff-roles";
import type { Context } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { getAdminWeeklyUsage } from "../lib/admin-usage-weeks";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const adminApiRouter = new Hono<{ Variables: Variables }>();

adminApiRouter.use("*", adminGuard);

async function audit(c: Context, entry: Omit<StaffAuditEntry, "actorId" | "actorEmail">) {
  const actor = await resolveStaffActor(c as never);
  if (!actor) return;
  await recordStaffAction({ ...entry, actorId: actor.id, actorEmail: actor.email });
}

function roleLabel(role: StaffRole | null): string {
  return role ? STAFF_ROLE_LABELS[role] : "no staff access";
}

function staffRoleError(c: Context, code: string) {
  const messages: Record<string, [string, number]> = {
    DOMAIN_NOT_ALLOWED: [`Super Admin is limited to @${PLATFORM_ADMIN_EMAIL_DOMAIN} accounts.`, 400],
    SELF_CHANGE: ["You can't change your own staff role.", 400],
    SELF_DEMOTE: ["You can't remove your own admin access.", 400],
    LAST_SUPER_ADMIN: ["Alenio needs at least one Super Admin.", 400],
    ALLOWLISTED: [
      "This email is pinned as a Super Admin in the server configuration (PLATFORM_ADMIN_EMAILS).",
      400,
    ],
  };
  const [message, status] = messages[code] ?? ["User not found", 404];
  return c.json({ error: { message, code } }, status as 400 | 404);
}

adminApiRouter.get("/activity", requireAbility("activity.view"), async (c) => {
  const beforeRaw = c.req.query("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const rows = await listStaffActions({
    limit: Number(c.req.query("limit")) || 50,
    before: before && !Number.isNaN(before.getTime()) ? before : null,
    actorId: c.req.query("actorId") || null,
  });
  return c.json({ data: rows });
});

adminApiRouter.get("/stats", requireAbility("overview.view"), async (c) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    users,
    teams,
    tasks,
    messages,
    activeSubscriptions,
    usersThisWeek,
    teamsThisWeek,
    checkIns,
    checkInsThisWeek,
    developmentGoals,
    activeGoals,
    recentUsers,
    recentTeams,
    recentSubscriptions,
    recentMembers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.task.count({ where: { kind: "workspace_task" } }),
    prisma.message.count(),
    prisma.teamSubscription.count({
      where: { status: "active", plan: { not: "free" } },
    }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.team.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.oneOnOneMeeting.count({ where: { status: "published" } }),
    prisma.oneOnOneMeeting.count({
      where: { status: "published", createdAt: { gte: weekAgo } },
    }),
    prisma.developmentGoal.count(),
    prisma.developmentGoal.count({ where: { status: "active", archivedAt: null } }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        isAdmin: true,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          where: { role: "owner" },
          take: 1,
          select: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.teamSubscription.findMany({
      where: {
        updatedAt: { gte: thirtyDaysAgo },
        OR: [
          { plan: { not: "free" }, status: "active" },
          { status: "past_due" },
          { status: "canceled" },
        ],
      },
      select: {
        id: true,
        teamId: true,
        plan: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        team: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.teamMember.findMany({
      where: {
        joinedAt: { gte: thirtyDaysAgo },
        role: { not: "owner" },
      },
      select: {
        id: true,
        joinedAt: true,
        role: true,
        teamId: true,
        user: { select: { id: true, name: true, email: true } },
        team: { select: { name: true } },
      },
      orderBy: { joinedAt: "desc" },
      take: 15,
    }),
  ]);

  type AdminAlert = {
    id: string;
    type: string;
    title: string;
    subtitle: string | null;
    occurredAt: string;
    entityId: string | null;
    entityKind: "user" | "team" | "subscription" | null;
  };

  const alerts: AdminAlert[] = [];

  for (const user of recentUsers) {
    alerts.push({
      id: `user:${user.id}`,
      type: "user_signup",
      title: "New user signed up",
      subtitle: `${user.name} · ${user.email}`,
      occurredAt: user.createdAt.toISOString(),
      entityId: user.id,
      entityKind: "user",
    });
  }

  for (const team of recentTeams) {
    const owner = team.members[0]?.user;
    alerts.push({
      id: `team:${team.id}`,
      type: "workspace_created",
      title: "New workplace created",
      subtitle: owner
        ? `${team.name} · by ${owner.name}`
        : team.name,
      occurredAt: team.createdAt.toISOString(),
      entityId: team.id,
      entityKind: "team",
    });
  }

  for (const sub of recentSubscriptions) {
    const workspace = sub.team.name;
    if (sub.status === "past_due") {
      alerts.push({
        id: `sub-past-due:${sub.id}:${sub.updatedAt.toISOString()}`,
        type: "subscription_past_due",
        title: "Payment past due",
        subtitle: `${workspace} · Team plan`,
        occurredAt: sub.updatedAt.toISOString(),
        entityId: sub.teamId,
        entityKind: "team",
      });
    } else if (sub.status === "canceled") {
      alerts.push({
        id: `sub-canceled:${sub.id}:${sub.updatedAt.toISOString()}`,
        type: "subscription_canceled",
        title: "Subscription canceled",
        subtitle: workspace,
        occurredAt: sub.updatedAt.toISOString(),
        entityId: sub.teamId,
        entityKind: "team",
      });
    } else if (sub.plan !== "free" && sub.status === "active") {
      const isNew =
        Math.abs(sub.updatedAt.getTime() - sub.createdAt.getTime()) < 5 * 60 * 1000;
      alerts.push({
        id: `sub-started:${sub.id}:${sub.updatedAt.toISOString()}`,
        type: "subscription_started",
        title: isNew ? "New paid subscription" : "Subscription updated",
        subtitle: `${workspace} · ${sub.plan} plan`,
        occurredAt: sub.updatedAt.toISOString(),
        entityId: sub.teamId,
        entityKind: "team",
      });
    }
  }

  for (const member of recentMembers) {
    alerts.push({
      id: `member:${member.id}`,
      type: "member_joined",
      title: "Member joined a workplace",
      subtitle: `${member.user.name} · ${member.team.name}`,
      occurredAt: member.joinedAt.toISOString(),
      entityId: member.user.id,
      entityKind: "user",
    });
  }

  alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const recentAlerts = alerts.slice(0, 40);
  const weeklyUsage = await getAdminWeeklyUsage(prisma, 8);

  return c.json({
    data: {
      users,
      teams,
      tasks,
      messages,
      activeSubscriptions,
      usersThisWeek,
      teamsThisWeek,
      checkIns,
      checkInsThisWeek,
      developmentGoals,
      activeGoals,
      weeklyUsage,
      recentUsers: recentUsers.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      recentAlerts,
    },
  });
});

adminApiRouter.get("/users", requireAbility("users.view"), async (c) => {
  const q = c.req.query("q")?.trim().toLowerCase() ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      accountType: true,
      staffRole: true,
      _count: { select: { teamMembers: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return c.json({ data: users.map(withIsAdmin) });
});

/**
 * Auth accounts that started signup (and may have received OTP email) but never
 * became a finished Alenio app user — unverified, or verified but never synced.
 */
adminApiRouter.get("/users/incomplete-signups", requireAbility("users.view"), async (c) => {
  const q = c.req.query("q")?.trim().toLowerCase() ?? "";
  type IncompleteRow = {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    createdAt: Date;
    hasAppUser: boolean;
  };

  let rows: IncompleteRow[] = [];
  try {
    rows = await prisma.$queryRaw<IncompleteRow[]>`
      SELECT
        a.id::text AS id,
        a.email,
        a.name,
        a."emailVerified" AS "emailVerified",
        a."createdAt" AS "createdAt",
        (u.id IS NOT NULL) AS "hasAppUser"
      FROM neon_auth."user" a
      LEFT JOIN public."User" u ON u.id = a.id::text
      WHERE a."emailVerified" = false OR u.id IS NULL
      ORDER BY a."createdAt" DESC
      LIMIT 500
    `;
  } catch (err) {
    console.error("[admin] incomplete-signups query failed:", err);
    return c.json(
      { error: { message: "Could not load incomplete signups from Better Auth.", code: "AUTH_QUERY_FAILED" } },
      500,
    );
  }

  const filtered = q
    ? rows.filter(
        (row) =>
          row.email.toLowerCase().includes(q) ||
          (row.name ?? "").toLowerCase().includes(q),
      )
    : rows;

  let authUserCount: number | null = null;
  let appUserCount: number | null = null;
  try {
    const [authCountRows, appCount] = await Promise.all([
      prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM neon_auth."user"`,
      prisma.user.count(),
    ]);
    authUserCount = authCountRows[0]?.n ?? null;
    appUserCount = appCount;
  } catch {
    // Counts are optional for the UI.
  }

  return c.json({
    data: filtered.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name?.trim() || row.email.split("@")[0] || "Unknown",
      emailVerified: Boolean(row.emailVerified),
      hasAppUser: Boolean(row.hasAppUser),
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
      status: !row.emailVerified
        ? "awaiting_verification"
        : row.hasAppUser
          ? "synced"
          : "verified_not_synced",
    })),
    meta: {
      authUserCount,
      appUserCount,
      incompleteCount: rows.length,
    },
  });
});

adminApiRouter.post(
  "/users",
  requireAbility("users.create"),
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      name: z.string().trim().min(1).max(200),
      password: z.string().min(8).max(128),
      isAdmin: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createPlatformUser(body);
    if (!result.ok) {
      if (result.code === "EMAIL_TAKEN") {
        return c.json({ error: { message: "A user with this email already exists.", code: result.code } }, 409);
      }
      if (result.code === "AUTH_FAILED") {
        return c.json({ error: { message: "Could not create login for this user.", code: result.code } }, 500);
      }
      if (result.code === "REGULAR_ACCOUNT") {
        return c.json(
          {
            error: {
              message: "Admin access is a separate account. It cannot be added to a regular account.",
              code: result.code,
            },
          },
          400,
        );
      }
      return c.json({ error: { message: "Invalid user details.", code: result.code } }, 400);
    }
    await audit(c, {
      action: "user.create",
      targetType: "user",
      targetId: result.user.id,
      summary: `Created account ${result.user.email}`,
    });
    return c.json({ data: result.user }, 201);
  },
);

adminApiRouter.get("/users/:id", requireAbility("users.view"), async (c) => {
  const { id } = c.req.param();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      accountType: true,
      staffRole: true,
      emailVerified: true,
      _count: {
        select: {
          teamMembers: true,
          tasksCreated: { where: { kind: "workspace_task" } },
        },
      },
      teamMembers: {
        select: {
          role: true,
          joinedAt: true,
          team: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!user) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: withIsAdmin(user) });
});

adminApiRouter.patch(
  "/users/:id",
  requireAbility("users.edit"),
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(200).optional(),
      email: z.string().email().optional(),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
    // Changing a staff login's email would hand over that login, so it takes staff.manage.
    const actor = await resolveStaffActor(c as never);
    if (existing.accountType === "platform_admin" && !roleHasAbility(actor?.role ?? null, "staff.manage")) {
      return c.json(
        { error: { message: "Only a Super Admin can edit staff accounts.", code: "STAFF_FORBIDDEN" } },
        403,
      );
    }
    if (body.email !== undefined) {
      const emailError = checkUserEmailChange({ actorEmail: actor?.email ?? null, target: existing, nextEmail: body.email });
      if (emailError === "EMAIL_CHANGE_COMPANY_ONLY") {
        return c.json(
          {
            error: {
              message: `Only @${PLATFORM_ADMIN_EMAIL_DOMAIN} staff can change a user's email.`,
              code: emailError,
            },
          },
          403,
        );
      }
      if (emailError === "SUPER_ADMIN_EMAIL_DOMAIN") {
        return c.json(
          { error: { message: `A Super Admin's email must stay on @${PLATFORM_ADMIN_EMAIL_DOMAIN}.`, code: emailError } },
          400,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      },
      select: { id: true, name: true, email: true, image: true, createdAt: true, accountType: true, staffRole: true },
    });

    const changes: string[] = [];
    if (body.name !== undefined && body.name !== existing.name) changes.push(`name "${existing.name ?? ""}" to "${body.name}"`);
    const nextEmail = body.email?.trim().toLowerCase();
    if (nextEmail !== undefined && nextEmail !== existing.email) changes.push(`email ${existing.email} to ${nextEmail}`);
    if (changes.length > 0) {
      await audit(c, {
        action: "user.edit",
        targetType: "user",
        targetId: id,
        summary: `Changed ${changes.join(" and ")}`,
      });
    }

    return c.json({ data: withIsAdmin(updated) });
  },
);

adminApiRouter.patch(
  "/users/:id/staff-role",
  requireAbility("staff.manage"),
  zValidator("json", z.object({ role: z.enum(STAFF_ROLES).nullable() })),
  async (c) => {
    const actor = c.get("user");
    const { id } = c.req.param();
    const { role } = c.req.valid("json");
    const result = await setStaffRole(actor!.id, id, role);
    if (!result.ok) return staffRoleError(c, result.code);
    if (result.previousRole !== role) {
      await audit(c, {
        action: "staff.role",
        targetType: "user",
        targetId: id,
        summary: `Changed ${result.user.email}'s staff role from ${roleLabel(result.previousRole)} to ${roleLabel(role)}`,
      });
    }
    return c.json({ data: result.user });
  },
);

/** Older clients: on/off staff access. New clients use /staff-role. */
adminApiRouter.patch(
  "/users/:id/admin",
  requireAbility("staff.manage"),
  zValidator("json", z.object({ isAdmin: z.boolean() })),
  async (c) => {
    const actor = c.get("user");
    const { id } = c.req.param();
    const { isAdmin } = c.req.valid("json");
    if (!isAdmin && id === actor!.id) return staffRoleError(c, "SELF_DEMOTE");
    const result = await setPlatformAdmin(actor!.id, id, isAdmin);
    if (!result.ok) return staffRoleError(c, result.code);
    const nextRole = result.user.staffRole;
    if (result.previousRole !== nextRole) {
      await audit(c, {
        action: "staff.role",
        targetType: "user",
        targetId: id,
        summary: `Changed ${result.user.email}'s staff role from ${roleLabel(result.previousRole)} to ${roleLabel(nextRole)}`,
      });
    }
    return c.json({ data: result.user });
  },
);

adminApiRouter.delete("/users/:id", requireAbility("users.delete"), async (c) => {
  const actor = c.get("user");
  const { id } = c.req.param();
  try {
    const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    const result = await deletePlatformUser(actor!.id, id);
    if (!result.ok) {
      if (result.code === "SELF_DELETE") {
        return c.json({ error: { message: "Cannot delete your own admin account", code: result.code } }, 400);
      }
      if (result.code === "ADMIN_DELETE") {
        return c.json({ error: { message: "Cannot delete other admin accounts", code: result.code } }, 400);
      }
      return c.json({ error: { message: "User not found", code: result.code } }, 404);
    }
    await audit(c, {
      action: "user.delete",
      targetType: "user",
      targetId: id,
      summary: `Deleted account ${target?.email ?? id}`,
    });
    return c.json({ data: { deleted: true } });
  } catch (err) {
    console.error("[admin-delete-user] failed for user", id, err);
    return c.json({ error: { message: "Could not delete user", code: "DELETE_FAILED" } }, 500);
  }
});

adminApiRouter.get("/teams", requireAbility("teams.view"), async (c) => {
  const teams = await listPlatformTeams();
  return c.json({ data: teams });
});

adminApiRouter.get("/teams/:teamId", requireAbility("teams.view"), async (c) => {
  const { teamId } = c.req.param();
  const result = await getPlatformTeam(teamId);
  if (!result.ok) {
    return c.json({ error: { message: "Team not found", code: result.code } }, 404);
  }
  return c.json({ data: result.team });
});

adminApiRouter.post(
  "/teams",
  requireAbility("teams.edit"),
  zValidator(
    "json",
    z.object({
      teamName: z.string().trim().min(1).max(200),
      ownerEmail: z.string().email(),
      ownerName: z.string().trim().min(1).max(200),
      ownerPassword: z.string().min(8).max(128).optional(),
      plan: z.enum(["team", "pro", "operations"]).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createEnterpriseAccount(body);
    if (!result.ok) {
      if (result.code === "TEAM_NAME_TAKEN") {
        return c.json({ error: { message: "This owner already has a workspace with this name.", code: result.code } }, 409);
      }
      if (result.code === "PASSWORD_REQUIRED") {
        return c.json(
          { error: { message: "Owner password is required when creating a new user.", code: result.code } },
          400,
        );
      }
      if (result.code === "EMAIL_TAKEN" || result.code === "AUTH_FAILED") {
        return c.json({ error: { message: "Could not create owner account.", code: result.code } }, 500);
      }
      return c.json({ error: { message: "Invalid enterprise account details.", code: result.code } }, 400);
    }
    await audit(c, {
      action: "team.create",
      targetType: "team",
      targetId: (result as { team?: { id?: string } }).team?.id ?? null,
      summary: `Created workspace "${body.teamName}" for ${body.ownerEmail}`,
    });
    return c.json({ data: result }, 201);
  },
);

adminApiRouter.patch(
  "/teams/:teamId/subscription",
  requireAbility("teams.edit"),
  zValidator(
    "json",
    z.object({
      plan: z.enum(["team", "pro", "operations"]).optional(),
      status: z.enum(["active", "canceled", "past_due", "trialing", "expired"]).optional(),
    }),
  ),
  async (c) => {
    const { teamId } = c.req.param();
    const body = c.req.valid("json");
    const result = await updateTeamSubscription(teamId, body);
    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return c.json({ error: { message: "Team not found", code: result.code } }, 404);
      }
      return c.json({ error: { message: "Invalid subscription values.", code: result.code } }, 400);
    }
    const parts = [body.plan ? `plan to ${body.plan}` : null, body.status ? `status to ${body.status}` : null].filter(Boolean);
    await audit(c, {
      action: "team.subscription",
      targetType: "team",
      targetId: teamId,
      summary: `Changed subscription ${parts.join(" and ") || "settings"}`,
    });
    return c.json({ data: result.subscription });
  },
);

adminApiRouter.get("/organizations", requireAbility("orgs.view"), async (c) => {
  try {
    const organizations = await listAdminOrganizations();
    return c.json({ data: organizations });
  } catch (err) {
    console.error("[admin] list organizations failed:", err);
    return c.json({ error: { message: "Could not load enterprise customers", code: "LIST_FAILED" } }, 500);
  }
});

adminApiRouter.get("/organizations/:organizationId", requireAbility("orgs.view"), async (c) => {
  const { organizationId } = c.req.param();
  try {
    const organization = await getAdminOrganization(organizationId);
    if (!organization) {
      return c.json({ error: { message: "Enterprise customer not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: organization });
  } catch (err) {
    console.error("[admin] get organization failed:", err);
    return c.json({ error: { message: "Could not load enterprise customer", code: "GET_FAILED" } }, 500);
  }
});

adminApiRouter.post(
  "/organizations",
  requireAbility("orgs.edit"),
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(2).max(120),
      domain: z.string().trim().min(3).max(200).optional(),
      markDomainVerified: z.boolean().optional(),
      ownerEmail: z.string().email().optional(),
      ownerName: z.string().trim().min(1).max(200).optional(),
      ownerPassword: z.string().min(8).max(128).optional(),
      initialWorkspaceName: z.string().trim().min(2).max(200).optional(),
      plan: z.enum(["team", "pro", "operations"]).optional(),
      workspaceLimit: z.number().int().min(1).max(500).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const result = await createAdminOrganization(body);
      if (!result.ok) {
        if (result.code === "DOMAIN_TAKEN") {
          return c.json({ error: { message: "That email domain is already linked to another customer.", code: result.code } }, 409);
        }
        if (result.code === "TEAM_NAME_TAKEN") {
          return c.json({ error: { message: "This owner already has a workspace with this name.", code: result.code } }, 409);
        }
        if (result.code === "OWNER_REQUIRED_FOR_WORKSPACE") {
          return c.json(
            {
              error: {
                message: "Owner email is required when creating the first workspace.",
                code: result.code,
              },
            },
            400,
          );
        }
        if (result.code === "PASSWORD_REQUIRED") {
          return c.json(
            {
              error: {
                message:
                  "That owner email already needs a password only when creating an existing-user workspace fails — try again or omit the first workspace.",
                code: result.code,
              },
            },
            400,
          );
        }
        if (result.code === "EMAIL_TAKEN" || result.code === "AUTH_FAILED") {
          return c.json({ error: { message: "Could not create owner account.", code: result.code } }, 500);
        }
        return c.json(
          {
            error: {
              message: "Invalid enterprise customer details.",
              code: "code" in result ? String(result.code) : "VALIDATION",
            },
          },
          400,
        );
      }
      await audit(c, {
        action: "org.create",
        targetType: "organization",
        targetId: (result.organization as { id?: string } | null)?.id ?? null,
        summary: `Created enterprise customer "${body.name}"`,
      });
      return c.json(
        {
          data: result.organization,
          welcomeEmail: result.welcomeEmail,
        },
        201,
      );
    } catch (err) {
      console.error("[admin] create organization failed:", err);
      return c.json({ error: { message: "Could not create enterprise customer", code: "CREATE_FAILED" } }, 500);
    }
  },
);

adminApiRouter.post(
  "/organizations/:organizationId/attach-team",
  requireAbility("orgs.edit"),
  zValidator(
    "json",
    z.object({
      teamId: z.string().trim().min(1),
    }),
  ),
  async (c) => {
    const { organizationId } = c.req.param();
    const { teamId } = c.req.valid("json");
    try {
      const result = await attachTeamToOrganization(organizationId, teamId);
      if (!result.ok) {
        if (result.code === "ORG_NOT_FOUND") {
          return c.json({ error: { message: "Enterprise customer not found", code: result.code } }, 404);
        }
        if (result.code === "TEAM_NOT_FOUND") {
          return c.json({ error: { message: "Workspace not found", code: result.code } }, 404);
        }
        if (result.code === "TEAM_ALREADY_LINKED") {
          return c.json(
            { error: { message: "That workspace already belongs to another enterprise customer.", code: result.code } },
            409,
          );
        }
        if (result.code === "WORKSPACE_LIMIT") {
          return c.json(
            {
              error: {
                message: `This customer is at their workspace cap (${result.workspaceLimit}). Raise the limit first.`,
                code: result.code,
              },
            },
            409,
          );
        }
        return c.json({ error: { message: "Could not attach workspace", code: "ATTACH_FAILED" } }, 400);
      }
      await audit(c, {
        action: "org.attach_team",
        targetType: "organization",
        targetId: organizationId,
        summary: `Attached workspace ${teamId} to the enterprise customer`,
      });
      return c.json({ data: result.organization });
    } catch (err) {
      console.error("[admin] attach team failed:", err);
      return c.json({ error: { message: "Could not attach workspace", code: "ATTACH_FAILED" } }, 500);
    }
  },
);

adminApiRouter.patch(
  "/organizations/:organizationId/workspace-limit",
  requireAbility("orgs.edit"),
  zValidator(
    "json",
    z.object({
      workspaceLimit: z.number().int().min(1).max(500),
    }),
  ),
  async (c) => {
    const { organizationId } = c.req.param();
    const { workspaceLimit } = c.req.valid("json");
    try {
      const result = await updateAdminOrganizationWorkspaceLimit(organizationId, workspaceLimit);
      if (!result.ok) {
        if (result.code === "NOT_FOUND") {
          return c.json({ error: { message: "Enterprise customer not found", code: result.code } }, 404);
        }
        if (result.code === "LIMIT_BELOW_USAGE") {
          return c.json(
            {
              error: {
                message: `Limit cannot be below current workspace count (${result.workspaceCount}).`,
                code: result.code,
              },
            },
            400,
          );
        }
        return c.json({ error: { message: "Could not update workspace limit", code: "UPDATE_FAILED" } }, 400);
      }
      await audit(c, {
        action: "org.workspace_limit",
        targetType: "organization",
        targetId: organizationId,
        summary: `Set the workspace limit to ${workspaceLimit}`,
      });
      return c.json({ data: result.organization });
    } catch (err) {
      console.error("[admin] update workspace limit failed:", err);
      return c.json({ error: { message: "Could not update workspace limit", code: "UPDATE_FAILED" } }, 500);
    }
  },
);

adminApiRouter.delete("/organizations/:organizationId", requireAbility("orgs.edit"), async (c) => {
  const { organizationId } = c.req.param();
  try {
    const result = await deleteAdminOrganization(organizationId);
    if (!result.ok) {
      return c.json({ error: { message: "Enterprise customer not found", code: result.code } }, 404);
    }
    await audit(c, {
      action: "org.delete",
      targetType: "organization",
      targetId: organizationId,
      summary: "Removed the enterprise customer",
    });
    return c.json({ data: result });
  } catch (err) {
    console.error("[admin] delete organization failed:", err);
    return c.json({ error: { message: "Could not remove enterprise customer", code: "DELETE_FAILED" } }, 500);
  }
});

export { adminApiRouter };
