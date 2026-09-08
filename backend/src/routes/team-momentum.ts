import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import {
  getTeamMomentumMemberDetail,
  getTeamMomentumSummary,
  TeamMomentumAccessError,
} from "../lib/team-momentum";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const teamMomentumRouter = new Hono<{ Variables: Variables }>();
teamMomentumRouter.use("*", authGuard);

function accessError(error: TeamMomentumAccessError) {
  return {
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

teamMomentumRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  try {
    return c.json({ data: await getTeamMomentumSummary(teamId, user.id) });
  } catch (error) {
    if (error instanceof TeamMomentumAccessError) {
      return c.json(accessError(error), error.status);
    }
    throw error;
  }
});

teamMomentumRouter.get(
  "/members/:memberUserId",
  zValidator(
    "query",
    z.object({
      currentRunLimit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId");
    const { currentRunLimit } = c.req.valid("query");
    try {
      return c.json({
        data: await getTeamMomentumMemberDetail(
          teamId,
          memberUserId,
          user.id,
          currentRunLimit,
        ),
      });
    } catch (error) {
      if (error instanceof TeamMomentumAccessError) {
        return c.json(accessError(error), error.status);
      }
      throw error;
    }
  },
);

export { teamMomentumRouter };
