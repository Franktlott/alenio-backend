import { Hono } from "hono";
import { auth } from "../auth";
import { HEARTBEAT_WRITE_THROTTLE_MS } from "../lib/presence";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const presenceRouter = new Hono<{ Variables: Variables }>();
presenceRouter.use("*", authGuard);

presenceRouter.post("/heartbeat", async (c) => {
  const user = c.get("user")!;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - HEARTBEAT_WRITE_THROTTLE_MS);

  await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: staleBefore } }],
    },
    data: { lastActiveAt: now },
  });

  return c.json({ data: { ok: true } });
});

export { presenceRouter };
