import { Hono } from "hono";
import { auth } from "../auth";
import {
  getMemberNextAction,
  MemberNextActionAccessError,
} from "../lib/member-next-action-data";
import { prismaRouteError } from "../lib/prisma-errors";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const memberNextActionRouter = new Hono<{ Variables: Variables }>();
memberNextActionRouter.use("*", authGuard);

memberNextActionRouter.get("/:memberUserId/next-action", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  try {
    const data = await getMemberNextAction(teamId, memberUserId, user.id);
    return c.json({ data });
  } catch (error) {
    if (error instanceof MemberNextActionAccessError) {
      return c.json(
        { error: { message: error.message, code: error.code } },
        error.status,
      );
    }
    return prismaRouteError(c, error, "Get member next action error");
  }
});

export { memberNextActionRouter };
