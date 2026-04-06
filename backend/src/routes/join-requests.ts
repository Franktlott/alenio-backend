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

// DELETE /api/join-requests/:requestId - cancel a join request
joinRequestsRouter.delete("/:requestId", async (c) => {
  const user = c.get("user")!;
  const { requestId } = c.req.param();

  const request = await prisma.joinRequest.findUnique({ where: { id: requestId } });
  if (!request || request.userId !== user.id) {
    return c.json({ error: { message: "Request not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.joinRequest.delete({ where: { id: requestId } });
  return c.json({ data: { success: true } });
});

export { joinRequestsRouter };
