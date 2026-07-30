import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import type { TeamHealthHistoryResponse } from "../types";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const teamHealthHistoryRouter = new Hono<{ Variables: Variables }>();
teamHealthHistoryRouter.use("*", authGuard);

teamHealthHistoryRouter.get(
  "/",
  zValidator(
    "query",
    z.object({
      days: z.coerce.number().int().min(3).max(90).default(14),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const { days } = c.req.valid("query");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
      select: { id: true },
    });
    if (!membership) {
      return c.json(
        { error: { message: "Workspace not found", code: "NOT_FOUND" } },
        404,
      );
    }

    const snapshots = await prisma.teamHealthSnapshot.findMany({
      where: { teamId },
      orderBy: { snapshotDate: "desc" },
      take: days,
    });

    const data: TeamHealthHistoryResponse = snapshots.reverse().map((snapshot) => ({
      date: snapshot.snapshotDate,
      teamHealthPct: snapshot.teamHealthPct,
      checkInPct: snapshot.checkInPct,
      goalsPct: snapshot.goalsPct,
      tasksPct: snapshot.tasksPct,
      memberCount: snapshot.memberCount,
      capturedAt: snapshot.capturedAt.toISOString(),
    }));
    return c.json({ data });
  },
);

export { teamHealthHistoryRouter };
