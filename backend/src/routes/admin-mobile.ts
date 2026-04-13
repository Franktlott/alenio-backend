import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const adminMobileRouter = new Hono<{ Variables: Variables }>();

// Middleware: check if current user is admin
adminMobileRouter.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });

  if (!fullUser?.isAdmin) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  await next();
});

// GET stats
adminMobileRouter.get("/stats", async (c) => {
  const [users, teams, tasks, messages] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.task.count(),
    prisma.message.count(),
  ]);
  return c.json({ data: { users, teams, tasks, messages } });
});

// GET users
adminMobileRouter.get("/users", async (c) => {
  const users = await prisma.user.findMany({
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

// GET single user
adminMobileRouter.get("/users/:id", async (c) => {
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
    },
  });
  if (!user) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: user });
});

// PATCH user - update name or email
adminMobileRouter.patch("/users/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const { name, email } = body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
    },
    select: { id: true, name: true, email: true, image: true, createdAt: true, isAdmin: true },
  });

  return c.json({ data: updated });
});

// DELETE user
adminMobileRouter.delete("/users/:id", async (c) => {
  const currentUser = c.get("user");
  const { id } = c.req.param();

  if (id === currentUser?.id) {
    return c.json({ error: { message: "Cannot delete your own admin account", code: "FORBIDDEN" } }, 400);
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);

  if (targetUser.isAdmin) {
    return c.json({ error: { message: "Cannot delete other admin accounts", code: "FORBIDDEN" } }, 400);
  }

  // Delete in dependency order (non-cascade relations)
  await prisma.pollVote.deleteMany({ where: { userId: id } });
  await prisma.poll.deleteMany({ where: { createdById: id } });
  await prisma.directMessage.deleteMany({ where: { senderId: id } });
  await prisma.message.deleteMany({ where: { senderId: id } });
  await prisma.topic.deleteMany({ where: { createdById: id } });
  await prisma.taskTemplate.deleteMany({ where: { createdById: id } });
  await prisma.task.deleteMany({ where: { creatorId: id } });
  await prisma.user.delete({ where: { id } });

  return c.json({ data: { deleted: true } });
});

export { adminMobileRouter };
