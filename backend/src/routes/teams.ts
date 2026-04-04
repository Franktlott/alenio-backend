import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const teamsRouter = new Hono<{ Variables: Variables }>();

// Apply auth guard to all routes
teamsRouter.use("*", authGuard);

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// GET /api/teams - list teams for current user
teamsRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        include: {
          _count: { select: { members: true, tasks: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return c.json({ data: memberships.map((m) => ({ ...m.team, role: m.role })) });
});

// POST /api/teams - create team
teamsRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name } = body;
  if (!name?.trim()) {
    return c.json({ error: { message: "Team name is required", code: "VALIDATION_ERROR" } }, 400);
  }

  let inviteCode = generateInviteCode();
  // Ensure uniqueness
  while (await prisma.team.findUnique({ where: { inviteCode } })) {
    inviteCode = generateInviteCode();
  }

  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      inviteCode,
      members: {
        create: { userId: user.id, role: "owner" },
      },
    },
    include: { _count: { select: { members: true, tasks: true } } },
  });

  return c.json({ data: { ...team, role: "owner" } }, 201);
});

// POST /api/teams/join - join team by invite code
teamsRouter.post("/join", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { inviteCode } = body;

  const team = await prisma.team.findUnique({ where: { inviteCode } });
  if (!team) {
    return c.json({ error: { message: "Invalid invite code", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
  });
  if (existing) {
    return c.json({ error: { message: "Already a member of this team", code: "CONFLICT" } }, 409);
  }

  await prisma.teamMember.create({ data: { userId: user.id, teamId: team.id, role: "member" } });

  const fullTeam = await prisma.team.findUnique({
    where: { id: team.id },
    include: { _count: { select: { members: true, tasks: true } } },
  });

  return c.json({ data: { ...fullTeam, role: "member" } });
});

// GET /api/teams/:teamId - get team details
teamsRouter.get("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Team not found", code: "NOT_FOUND" } }, 404);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      _count: { select: { tasks: true } },
    },
  });

  return c.json({ data: { ...team, role: membership.role } });
});

// PATCH /api/teams/:teamId - update team name
teamsRouter.patch("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = await c.req.json();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: { name: body.name?.trim() },
  });

  return c.json({ data: team });
});

// DELETE /api/teams/:teamId/leave - leave team
teamsRouter.delete("/:teamId/leave", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  await prisma.teamMember.deleteMany({
    where: { userId: user.id, teamId },
  });

  return c.body(null, 204);
});

export { teamsRouter };
