import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushToUsers } from "../lib/push";
import { logActivity } from "../lib/activity";

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

// POST /api/teams/join - join team by invite code (creates a pending join request)
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
    return c.json({ error: { message: "Already a member", code: "CONFLICT" } }, 409);
  }

  const existingRequest = await prisma.joinRequest.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
  });
  if (existingRequest && existingRequest.status === "pending") {
    return c.json({ error: { message: "Request already pending", code: "CONFLICT" } }, 409);
  }

  let joinRequest;
  if (existingRequest) {
    // Reuse record if previously rejected
    joinRequest = await prisma.joinRequest.update({
      where: { id: existingRequest.id },
      data: { status: "pending" },
    });
  } else {
    joinRequest = await prisma.joinRequest.create({
      data: { teamId: team.id, userId: user.id, status: "pending" },
    });
  }

  // Notify team owners
  const owners = await prisma.teamMember.findMany({
    where: { teamId: team.id, role: { in: ["owner", "team_leader"] } },
    select: { userId: true },
  });
  const ownerIds = owners.map((o) => o.userId);
  await sendPushToUsers(ownerIds, "Join Request", `${user.name} wants to join ${team.name}`, { teamId: team.id, type: "join_request" });

  return c.json({ data: { status: "pending", teamName: team.name, requestId: joinRequest.id } });
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
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only the team owner can edit team info", code: "FORBIDDEN" } }, 403);
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.image !== undefined ? { image: body.image } : {}),
    },
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

  await logActivity({
    teamId,
    userId: user.id,
    type: "member_removed",
    metadata: { userName: user.name },
  });

  return c.body(null, 204);
});

// DELETE /api/teams/:teamId - delete team (owner only)
teamsRouter.delete("/:teamId", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only the team owner can delete the team", code: "FORBIDDEN" } }, 403);
  }

  await prisma.team.delete({ where: { id: teamId } });

  return c.body(null, 204);
});

// GET /api/teams/:teamId/join-requests - list pending join requests (owner only)
teamsRouter.get("/:teamId/join-requests", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only team owners can view join requests", code: "FORBIDDEN" } }, 403);
  }

  const requests = await prisma.joinRequest.findMany({
    where: { teamId, status: "pending" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ data: requests });
});

// POST /api/teams/:teamId/join-requests/:requestId/approve - approve a join request (owner only)
teamsRouter.post("/:teamId/join-requests/:requestId/approve", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only team owners can approve join requests", code: "FORBIDDEN" } }, 403);
  }

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { team: { select: { name: true } } },
  });
  if (!joinRequest || joinRequest.teamId !== teamId) {
    return c.json({ error: { message: "Join request not found", code: "NOT_FOUND" } }, 404);
  }

  // Create team member and update request status in a transaction
  await prisma.$transaction([
    prisma.teamMember.create({
      data: { userId: joinRequest.userId, teamId, role: "member" },
    }),
    prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: "approved" },
    }),
  ]);

  // Notify the requesting user
  await sendPushToUsers(
    [joinRequest.userId],
    "Request Approved!",
    `You've been approved to join ${joinRequest.team.name}`,
    { teamId, type: "join_approved" }
  );

  // Log activity for member joining
  const joinedUser = await prisma.user.findUnique({
    where: { id: joinRequest.userId },
    select: { name: true },
  });
  await logActivity({
    teamId,
    userId: joinRequest.userId,
    type: "member_joined",
    metadata: { userName: joinedUser?.name ?? "" },
  });

  return c.json({ data: { success: true } });
});

// POST /api/teams/:teamId/join-requests/:requestId/reject - reject a join request (owner only)
teamsRouter.post("/:teamId/join-requests/:requestId/reject", async (c) => {
  const user = c.get("user")!;
  const { teamId, requestId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only team owners can reject join requests", code: "FORBIDDEN" } }, 403);
  }

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { team: { select: { name: true } } },
  });
  if (!joinRequest || joinRequest.teamId !== teamId) {
    return c.json({ error: { message: "Join request not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: "rejected" },
  });

  // Notify the requesting user
  await sendPushToUsers(
    [joinRequest.userId],
    "Request Update",
    `Your request to join ${joinRequest.team.name} was not approved`,
    { teamId, type: "join_rejected" }
  );

  return c.json({ data: { success: true } });
});

// DELETE /api/teams/:teamId/members/:memberId - remove a member (owner only)
teamsRouter.delete("/:teamId/members/:memberId", async (c) => {
  const user = c.get("user")!;
  const { teamId, memberId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only team owners can remove members", code: "FORBIDDEN" } }, 403);
  }

  if (memberId === user.id) {
    return c.json({ error: { message: "You cannot remove yourself", code: "BAD_REQUEST" } }, 400);
  }

  const targetMembership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: memberId, teamId } },
    include: { user: { select: { name: true } } },
  });
  if (!targetMembership) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }
  if (["owner", "team_leader"].includes(targetMembership.role)) {
    return c.json({ error: { message: "Cannot remove an owner or team leader", code: "FORBIDDEN" } }, 403);
  }

  await prisma.teamMember.delete({
    where: { userId_teamId: { userId: memberId, teamId } },
  });

  await logActivity({
    teamId,
    userId: memberId,
    type: "member_removed",
    metadata: { userName: targetMembership.user.name ?? "" },
  });

  return c.body(null, 204);
});

export { teamsRouter };
