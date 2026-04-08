import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const activityRouter = new Hono<{ Variables: Variables }>();

activityRouter.use("*", authGuard);

activityRouter.get("/:teamId/activity", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const activities = await prisma.teamActivity.findMany({
    where: { teamId, createdAt: { gte: sevenDaysAgo } },
    include: {
      user: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return c.json({
    data: activities.map((a) => ({
      id: a.id,
      type: a.type,
      createdAt: a.createdAt,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      user: a.user,
      reactions: a.reactions.reduce((acc: Record<string, { count: number; userIds: string[] }>, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userIds: [] };
        acc[r.emoji]!.count++;
        acc[r.emoji]!.userIds.push(r.userId);
        return acc;
      }, {}),
    })),
  });
});

activityRouter.post(
  "/:teamId/activity/celebrate",
  zValidator("json", z.object({
    targetUserId: z.string(),
    celebrationType: z.string(),
    message: z.string().max(300).optional(),
  })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const { targetUserId, celebrationType, message } = c.req.valid("json");

    const [membership, targetMember] = await Promise.all([
      prisma.teamMember.findUnique({ where: { userId_teamId: { userId: user.id, teamId } } }),
      prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: targetUserId, teamId } },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    if (!targetMember) return c.json({ error: { message: "Target not a team member", code: "NOT_FOUND" } }, 404);

    const activity = await prisma.teamActivity.create({
      data: {
        teamId,
        userId: user.id,
        type: "celebration",
        metadata: JSON.stringify({
          targetUserId,
          targetName: targetMember.user.name,
          celebrationType,
          message: message?.trim() || null,
        }),
      },
    });

    return c.json({ data: { id: activity.id } }, 201);
  }
);

activityRouter.post(
  "/:teamId/activity/:activityId/react",
  zValidator("json", z.object({ emoji: z.string() })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId, activityId } = c.req.param();
    const { emoji } = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    // Find any existing reaction from this user on this activity (one reaction per user max)
    const existingAny = await prisma.teamActivityReaction.findFirst({
      where: { activityId, userId: user.id },
    });

    if (existingAny) {
      // Always remove the existing reaction first
      await prisma.teamActivityReaction.delete({ where: { id: existingAny.id } });
      if (existingAny.emoji !== emoji) {
        // Different emoji → swap in the new one
        await prisma.teamActivityReaction.create({ data: { emoji, userId: user.id, activityId } });
        return c.json({ data: { toggled: true } });
      }
      // Same emoji → just removed (toggle off)
      return c.json({ data: { toggled: false } });
    }

    await prisma.teamActivityReaction.create({ data: { emoji, userId: user.id, activityId } });
    return c.json({ data: { toggled: true } });
  }
);

export { activityRouter };
