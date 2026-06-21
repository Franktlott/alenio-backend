import { Hono } from "hono";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import {
  canManageLocationChecklists,
  getTeamMembership,
  teamHasChecklistPlan,
} from "../lib/checklist-locations";
import {
  ensureWorkspaceGoAccess,
  generateUniqueGoCode,
  normalizeGoCode,
} from "../lib/alenio-go";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

type Ctx = { get: (k: "user") => Variables["user"]; req: { param: (k: string) => string }; json: (body: unknown, status?: number) => Response };

const goLocationsRouter = new Hono<{ Variables: Variables }>();
goLocationsRouter.use("*", authGuard);

async function requireMember(c: Ctx) {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) return { error: c.json({ error: { message: "Forbidden" } }, 403) };
  return { user, teamId, membership };
}

async function requireManager(c: Ctx) {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx;
  if (!canManageLocationChecklists(ctx.membership.role)) {
    return { error: c.json({ error: { message: "Only managers can manage Alenio Go", code: "FORBIDDEN" } }, 403) };
  }
  return ctx;
}

/** One Go Code per workspace — used by the manager header QR. */
goLocationsRouter.get("/", async (c) => {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx.error;

  if (!(await teamHasChecklistPlan(ctx.teamId))) {
    return c.json({ data: { planRequired: true, goCode: null } });
  }

  const workspace = await ensureWorkspaceGoAccess(ctx.teamId, ctx.user.id);

  const sessionStats = await prisma.goSession.groupBy({
    by: ["goLocationId"],
    where: { teamId: ctx.teamId, goLocationId: workspace.id, startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    _count: { id: true },
    _max: { startedAt: true },
  });
  const stats = sessionStats[0];

  return c.json({
    data: {
      planRequired: false,
      goCode: workspace.goCode,
      isActive: workspace.isActive,
      recentSessions: stats?._count.id ?? 0,
      lastSessionAt: stats?._max.startedAt?.toISOString() ?? null,
    },
  });
});

goLocationsRouter.post("/regenerate-code", async (c) => {
  const ctx = await requireManager(c);
  if ("error" in ctx) return ctx.error;

  const workspace = await ensureWorkspaceGoAccess(ctx.teamId, ctx.user.id);
  const goCode = await generateUniqueGoCode();
  await prisma.goLocation.update({ where: { id: workspace.id }, data: { goCode } });
  await prisma.goSession.deleteMany({ where: { goLocationId: workspace.id } });

  return c.json({ data: { goCode } });
});

goLocationsRouter.get("/lookup/:code", async (c) => {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx.error;

  const code = normalizeGoCode(c.req.param("code") ?? "");
  const row = await prisma.goLocation.findFirst({
    where: { teamId: ctx.teamId, goCode: code },
    select: { goCode: true },
  });
  if (!row) return c.json({ error: { message: "Go Code not found in this workspace" } }, 404);
  return c.json({ data: row });
});

export { goLocationsRouter };
