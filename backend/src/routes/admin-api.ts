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
  updateTeamSubscription,
} from "../lib/admin-platform";
import { adminGuard } from "../middleware/admin-guard";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const adminApiRouter = new Hono<{ Variables: Variables }>();

adminApiRouter.use("*", adminGuard);

adminApiRouter.get("/stats", async (c) => {
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
    prisma.task.count(),
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
    prisma.developmentGoal.count({ where: { status: "active" } }),
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
  const alertsToday = recentAlerts.filter(
    (a) => Date.now() - new Date(a.occurredAt).getTime() < 24 * 60 * 60 * 1000,
  ).length;

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
      alertsToday,
      recentUsers: recentUsers.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      recentAlerts,
    },
  });
});

adminApiRouter.get("/users", async (c) => {
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
      isAdmin: true,
      _count: { select: { teamMembers: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return c.json({ data: users });
});

adminApiRouter.post(
  "/users",
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
      return c.json({ error: { message: "Invalid user details.", code: result.code } }, 400);
    }
    return c.json({ data: result.user }, 201);
  },
);

adminApiRouter.get("/users/:id", async (c) => {
  const { id } = c.req.param();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      isAdmin: true,
      emailVerified: true,
      _count: { select: { teamMembers: true, tasksCreated: true } },
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
  return c.json({ data: user });
});

adminApiRouter.patch(
  "/users/:id",
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

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      },
      select: { id: true, name: true, email: true, image: true, createdAt: true, isAdmin: true },
    });

    return c.json({ data: updated });
  },
);

adminApiRouter.patch(
  "/users/:id/admin",
  zValidator("json", z.object({ isAdmin: z.boolean() })),
  async (c) => {
    const { id } = c.req.param();
    const { isAdmin } = c.req.valid("json");
    const result = await setPlatformAdmin(id, isAdmin);
    if (!result.ok) {
      return c.json({ error: { message: "User not found", code: result.code } }, 404);
    }
    return c.json({ data: result.user });
  },
);

adminApiRouter.delete("/users/:id", async (c) => {
  const actor = c.get("user");
  const { id } = c.req.param();
  try {
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
    return c.json({ data: { deleted: true } });
  } catch (err) {
    console.error("[admin-delete-user] failed for user", id, err);
    return c.json({ error: { message: "Could not delete user", code: "DELETE_FAILED" } }, 500);
  }
});

adminApiRouter.get("/teams", async (c) => {
  const teams = await listPlatformTeams();
  return c.json({ data: teams });
});

adminApiRouter.get("/teams/:teamId", async (c) => {
  const { teamId } = c.req.param();
  const result = await getPlatformTeam(teamId);
  if (!result.ok) {
    return c.json({ error: { message: "Team not found", code: result.code } }, 404);
  }
  return c.json({ data: result.team });
});

adminApiRouter.post(
  "/teams",
  zValidator(
    "json",
    z.object({
      teamName: z.string().trim().min(1).max(200),
      ownerEmail: z.string().email(),
      ownerName: z.string().trim().min(1).max(200),
      ownerPassword: z.string().min(8).max(128).optional(),
      plan: z.enum(["free", "team", "pro"]).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createEnterpriseAccount(body);
    if (!result.ok) {
      if (result.code === "TEAM_NAME_TAKEN") {
        return c.json({ error: { message: "A workspace with this name already exists.", code: result.code } }, 409);
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
    return c.json({ data: result }, 201);
  },
);

adminApiRouter.patch(
  "/teams/:teamId/subscription",
  zValidator(
    "json",
    z.object({
      plan: z.enum(["free", "team", "pro"]).optional(),
      status: z.enum(["active", "canceled", "past_due", "trialing"]).optional(),
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
    return c.json({ data: result.subscription });
  },
);

export { adminApiRouter };
