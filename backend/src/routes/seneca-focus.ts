import { Hono } from "hono";
import { auth, type AppSession, type AppUser } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import {
  completeSenecaFocusAction,
  getOrCreateSenecaFocus,
  recordSenecaFocusOpen,
  refreshSenecaFocus,
  SenecaFocusCooldownError,
} from "../lib/seneca-focus-service";
import { resolveTimeZone } from "../lib/timezone";
import { canAccessSenecaFocus } from "../lib/seneca-focus-engine";

type Variables = {
  user: AppUser | typeof auth.$Infer.Session.user | null;
  session: AppSession | typeof auth.$Infer.Session.session | null;
};

const senecaFocusRouter = new Hono<{ Variables: Variables }>();
senecaFocusRouter.use("*", authGuard);

async function managerContext(userId: string, teamId: string) {
  const [membership, user] = await Promise.all([
    prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { role: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  const allowed = membership && canAccessSenecaFocus(membership.role);
  return allowed ? { timeZone: resolveTimeZone(user?.timezone) } : null;
}

senecaFocusRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const manager = await managerContext(user.id, teamId);
  if (!manager) {
    return c.json(
      { error: { message: "Today's Focus is available to workspace managers only.", code: "FORBIDDEN" } },
      403,
    );
  }
  const data = await getOrCreateSenecaFocus(teamId, user.id, manager.timeZone);
  return c.json({ data });
});

senecaFocusRouter.post("/refresh", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const manager = await managerContext(user.id, teamId);
  if (!manager) {
    return c.json(
      { error: { message: "Today's Focus is available to workspace managers only.", code: "FORBIDDEN" } },
      403,
    );
  }
  try {
    const data = await refreshSenecaFocus(teamId, user.id, manager.timeZone);
    return c.json({ data });
  } catch (error) {
    if (error instanceof SenecaFocusCooldownError) {
      return c.json(
        {
          error: {
            message: error.message,
            code: "RATE_LIMITED",
            refreshAvailableAt: error.availableAt.toISOString(),
          },
        },
        429,
      );
    }
    throw error;
  }
});

senecaFocusRouter.post("/:briefId/open", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const manager = await managerContext(user.id, teamId);
  if (!manager) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const found = await recordSenecaFocusOpen(teamId, user.id, c.req.param("briefId") as string);
  if (!found) return c.json({ error: { message: "Brief not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: { opened: true } });
});

senecaFocusRouter.post("/:briefId/actions/:actionId/complete", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const manager = await managerContext(user.id, teamId);
  if (!manager) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const data = await completeSenecaFocusAction({
    teamId,
    userId: user.id,
    briefId: c.req.param("briefId") as string,
    actionId: c.req.param("actionId") as string,
    timeZone: manager.timeZone,
  });
  if (!data) {
    return c.json({ error: { message: "Brief or action not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data });
});

export { senecaFocusRouter };
