import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const joinRequestsRouter = new Hono<{ Variables: Variables }>();

joinRequestsRouter.use("*", authGuard);

// GET /api/join-requests/mine - get current user's pending join requests
joinRequestsRouter.get("/mine", async (c) => {
  const user = c.get("user")!;

  const requests = await prisma.joinRequest.findMany({
    where: { userId: user.id, status: "pending" },
    include: {
      team: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ data: requests });
});

export { joinRequestsRouter };
