import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const topicsRouter = new Hono<{ Variables: Variables }>();
topicsRouter.use("*", authGuard);

const SPACE_LIMIT = 50;
const MANAGER_ROLES = ["owner", "team_leader", "admin"] as const;

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function canManageTeam(role: string) {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}

async function userCanAccessTopic(userId: string, topicId: string, teamId: string) {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, teamId, archivedAt: null },
    select: { id: true, privacy: true },
  });
  if (!topic) return null;
  if (topic.privacy === "open") return topic;
  const membership = await prisma.topicMember.findUnique({
    where: { topicId_userId: { topicId, userId } },
  });
  return membership ? topic : null;
}

// GET /api/teams/:teamId/topics - list spaces the user can see
topicsRouter.get("/:teamId/topics", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const items = await prisma.topic.findMany({
    where: {
      teamId,
      archivedAt: null,
      OR: [
        { privacy: "open" },
        { members: { some: { userId: user.id } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true, members: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, name: true } } },
      },
      members: {
        where: { userId: user.id },
        take: 1,
        select: { role: true },
      },
    },
  });

  const result = items.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    color: t.color,
    image: t.image,
    icon: t.icon,
    privacy: t.privacy,
    autoAddWorkspaceMembers: t.autoAddWorkspaceMembers,
    teamId: t.teamId,
    createdById: t.createdById,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy,
    memberCount: t.privacy === "open" ? undefined : t._count.members,
    messageCount: t._count.messages,
    myRole: t.members[0]?.role ?? (t.privacy === "open" ? "member" : null),
    lastMessage: t.messages[0]
      ? {
          id: t.messages[0].id,
          content: t.messages[0].content,
          mediaType: t.messages[0].mediaType,
          createdAt: t.messages[0].createdAt,
          sender: t.messages[0].sender,
        }
      : null,
  }));

  // For open spaces, attach workspace member count once
  const teamMemberCount = await prisma.teamMember.count({ where: { teamId } });
  const withCounts = result.map((t) => ({
    ...t,
    memberCount: t.memberCount ?? teamMemberCount,
  }));

  return c.json({ data: withCounts });
});

// POST /api/teams/:teamId/topics - create a space
topicsRouter.post("/:teamId/topics", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const body = await c.req.json<{
    name?: string;
    description?: string;
    color?: string;
    image?: string | null;
    icon?: string;
    privacy?: "open" | "private";
    autoAddWorkspaceMembers?: boolean;
    memberIds?: string[];
  }>();

  const name = body.name?.trim() ?? "";
  if (!name) {
    return c.json({ error: { message: "Space name is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const member = await getMembership(user.id, teamId);
  if (!member || !canManageTeam(member.role)) {
    return c.json({ error: { message: "Only owners and leaders can create spaces", code: "FORBIDDEN" } }, 403);
  }

  const duplicate = await prisma.topic.findFirst({
    where: { teamId, archivedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return c.json({ error: { message: "A space with that name already exists", code: "DUPLICATE_NAME" } }, 400);
  }

  const channelCount = await prisma.topic.count({ where: { teamId, archivedAt: null } });
  if (channelCount >= SPACE_LIMIT) {
    return c.json({ error: { message: "Space limit reached", code: "LIMIT_REACHED" } }, 400);
  }

  const privacy = body.privacy === "private" ? "private" : "open";
  const autoAdd = body.autoAddWorkspaceMembers ?? privacy === "open";
  const icon = (body.icon?.trim() || "hash").slice(0, 40);
  const color = body.color || "#4361EE";
  const image =
    typeof body.image === "string" && body.image.trim()
      ? body.image.trim()
      : body.image === null
        ? null
        : undefined;

  const topic = await prisma.$transaction(async (tx) => {
    const created = await tx.topic.create({
      data: {
        name,
        description: body.description?.trim() || undefined,
        color,
        ...(image !== undefined ? { image } : {}),
        icon,
        privacy,
        autoAddWorkspaceMembers: autoAdd,
        teamId,
        createdById: user.id,
      },
    });

    const memberIds = new Set<string>([user.id]);
    if (autoAdd || privacy === "open") {
      const teamMembers = await tx.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      for (const m of teamMembers) memberIds.add(m.userId);
    }
    if (Array.isArray(body.memberIds)) {
      for (const id of body.memberIds) {
        if (typeof id === "string" && id) memberIds.add(id);
      }
    }

    // Only seed TopicMember rows for private spaces (open = all workspace members implicitly)
    if (privacy === "private") {
      await tx.topicMember.createMany({
        data: [...memberIds].map((userId) => ({
          topicId: created.id,
          userId,
          role: userId === user.id ? ("owner" as const) : ("member" as const),
        })),
        skipDuplicates: true,
      });
    } else {
      await tx.topicMember.create({
        data: { topicId: created.id, userId: user.id, role: "owner" },
      });
    }

    return tx.topic.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { messages: true, members: true } },
      },
    });
  });

  return c.json(
    {
      data: {
        ...topic,
        memberCount: privacy === "private" ? topic._count.members : await prisma.teamMember.count({ where: { teamId } }),
        messageCount: topic._count.messages,
        lastMessage: null,
        myRole: "owner",
      },
    },
    201,
  );
});

// GET /api/teams/:teamId/topics/:topicId/members
topicsRouter.get("/:teamId/topics/:topicId/members", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const topic = await userCanAccessTopic(user.id, topicId, teamId);
  if (!topic) {
    return c.json({ error: { message: "Space not found", code: "NOT_FOUND" } }, 404);
  }

  if (topic.privacy === "open") {
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return c.json({
      data: teamMembers.map((m) => ({
        userId: m.userId,
        role: "member",
        workspaceRole: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    });
  }

  const members = await prisma.topicMember.findMany({
    where: { topicId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const workspaceRoles = await prisma.teamMember.findMany({
    where: { teamId, userId: { in: members.map((m) => m.userId) } },
    select: { userId: true, role: true },
  });
  const roleMap = Object.fromEntries(workspaceRoles.map((r) => [r.userId, r.role]));

  return c.json({
    data: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      workspaceRole: roleMap[m.userId] ?? "member",
      joinedAt: m.joinedAt,
      user: m.user,
    })),
  });
});

// DELETE /api/teams/:teamId/topics/:topicId/members/me - leave a private space
topicsRouter.delete("/:teamId/topics/:topicId/members/me", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();

  const membership = await getMembership(user.id, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, teamId, archivedAt: null },
    select: { id: true, privacy: true },
  });
  if (!topic) {
    return c.json({ error: { message: "Space not found", code: "NOT_FOUND" } }, 404);
  }
  if (topic.privacy !== "private") {
    return c.json({ error: { message: "Open spaces cannot be left", code: "VALIDATION_ERROR" } }, 400);
  }

  await prisma.topicMember.deleteMany({
    where: { topicId, userId: user.id },
  });

  return c.body(null, 204);
});

// POST /api/teams/:teamId/topics/:topicId/members - add members (private spaces)
topicsRouter.post("/:teamId/topics/:topicId/members", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();
  const { userIds } = await c.req.json<{ userIds?: string[] }>();

  const member = await getMembership(user.id, teamId);
  if (!member || !canManageTeam(member.role)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const topic = await prisma.topic.findFirst({ where: { id: topicId, teamId, archivedAt: null } });
  if (!topic) {
    return c.json({ error: { message: "Space not found", code: "NOT_FOUND" } }, 404);
  }

  const ids = Array.isArray(userIds) ? userIds.filter((id) => typeof id === "string" && id) : [];
  if (!ids.length) {
    return c.json({ error: { message: "userIds required", code: "VALIDATION_ERROR" } }, 400);
  }

  await prisma.topicMember.createMany({
    data: ids.map((userId) => ({ topicId, userId, role: "member" as const })),
    skipDuplicates: true,
  });

  return c.json({ data: { ok: true } });
});

// PATCH /api/teams/:teamId/topics/:topicId - update a space
topicsRouter.patch("/:teamId/topics/:topicId", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();
  const body = await c.req.json<{
    name?: string;
    description?: string;
    color?: string;
    image?: string | null;
    icon?: string;
    privacy?: "open" | "private";
    autoAddWorkspaceMembers?: boolean;
    archived?: boolean;
  }>();

  const member = await getMembership(user.id, teamId);
  if (!member || !canManageTeam(member.role)) {
    return c.json({ error: { message: "Only owners and leaders can edit spaces", code: "FORBIDDEN" } }, 403);
  }

  if (body.name?.trim()) {
    const duplicate = await prisma.topic.findFirst({
      where: {
        teamId,
        archivedAt: null,
        id: { not: topicId },
        name: { equals: body.name.trim(), mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      return c.json({ error: { message: "A space with that name already exists", code: "DUPLICATE_NAME" } }, 400);
    }
  }

  const topic = await prisma.topic.update({
    where: { id: topicId, teamId },
    data: {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.image === null
        ? { image: null }
        : typeof body.image === "string"
          ? { image: body.image.trim() || null }
          : {}),
      ...(body.icon?.trim() ? { icon: body.icon.trim().slice(0, 40) } : {}),
      ...(body.privacy === "open" || body.privacy === "private" ? { privacy: body.privacy } : {}),
      ...(typeof body.autoAddWorkspaceMembers === "boolean"
        ? { autoAddWorkspaceMembers: body.autoAddWorkspaceMembers }
        : {}),
      ...(body.archived === true ? { archivedAt: new Date() } : {}),
      ...(body.archived === false ? { archivedAt: null } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true, members: true } },
    },
  });

  return c.json({ data: topic });
});

// DELETE /api/teams/:teamId/topics/:topicId - delete a space
topicsRouter.delete("/:teamId/topics/:topicId", async (c) => {
  const user = c.get("user")!;
  const { teamId, topicId } = c.req.param();

  const member = await getMembership(user.id, teamId);
  if (!member || !canManageTeam(member.role)) {
    return c.json({ error: { message: "Only owners and leaders can delete spaces", code: "FORBIDDEN" } }, 403);
  }

  await prisma.topic.delete({ where: { id: topicId, teamId } });

  return c.body(null, 204);
});

export { topicsRouter };
