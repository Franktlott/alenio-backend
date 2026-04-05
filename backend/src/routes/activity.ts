import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

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
    })),
  });
});

export { activityRouter };
