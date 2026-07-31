import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const userActivityRouter = new Hono<{ Variables: Variables }>();

const ACTIVITY_FEED_DAYS = 14;
const ACTIVITY_FEED_LIMIT = 150;

userActivityRouter.use("*", authGuard);

function mapReactions(
  reactions: {
    emoji: string;
    userId: string;
    user: { id: string; name: string };
  }[],
) {
  return reactions.reduce(
    (acc: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userIds: [], users: [] };
      acc[r.emoji]!.count++;
      acc[r.emoji]!.userIds.push(r.userId);
      acc[r.emoji]!.users.push({ id: r.user.id, name: r.user.name });
      return acc;
    },
    {},
  );
}

/** Cross-workspace activity feed for the signed-in user. */
userActivityRouter.get("/", async (c) => {
  const user = c.get("user")!;

  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  const feedStart = new Date(Date.now() - ACTIVITY_FEED_DAYS * 24 * 60 * 60 * 1000);

  // Workspace activity from every workspace you belong to, plus your own
  // account-level activity, which has no teamId and outlives any employer.
  const activities = await prisma.teamActivity.findMany({
    where: {
      createdAt: { gte: feedStart },
      OR: [
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        { teamId: null, userId: user.id },
      ],
    },
    include: {
      team: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_FEED_LIMIT,
  });

  return c.json({
    data: activities.map((a) => ({
      id: a.id,
      teamId: a.teamId,
      team: a.team,
      type: a.type,
      createdAt: a.createdAt,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      user: a.user,
      reactions: mapReactions(a.reactions),
    })),
  });
});

export { userActivityRouter };
