import { Hono } from "hono";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import {
  canManageLocationChecklists,
  ensureTeamChecklistHubToken,
  getTeamMembership,
  startOfTodayUtc,
  teamHasChecklistPlan,
} from "../lib/checklist-locations";
import { parseChecklistCardColor } from "../lib/checklist-card-colors";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

type Ctx = { get: (k: "user") => Variables["user"]; req: { param: (k: string) => string }; json: (body: unknown, status?: number) => Response };

const checklistLocationsRouter = new Hono<{ Variables: Variables }>();
checklistLocationsRouter.use("*", authGuard);

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
    return { error: c.json({ error: { message: "Only managers can manage location checklists", code: "FORBIDDEN" } }, 403) };
  }
  return ctx;
}

async function requirePlan(teamId: string) {
  if (!(await teamHasChecklistPlan(teamId))) {
    return false;
  }
  return true;
}

function parseChecklistItemRows(rawItems: unknown[]) {
  return rawItems
    .map((row, idx) => {
      if (!row || typeof row !== "object") return null;
      const title = typeof (row as { title?: unknown }).title === "string" ? (row as { title: string }).title.trim() : "";
      if (!title) return null;
      const categoryRaw =
        typeof (row as { category?: unknown }).category === "string"
          ? (row as { category: string }).category.trim().slice(0, 80)
          : "";
      const noteRaw =
        typeof (row as { note?: unknown }).note === "string"
          ? (row as { note: string }).note.trim().slice(0, 280)
          : "";
      return { title, note: noteRaw || null, category: categoryRaw || null, sortOrder: idx };
    })
    .filter((x): x is { title: string; note: string | null; category: string | null; sortOrder: number } => x !== null);
}

function serializeLocationRow(
  location: {
    id: string;
    name: string;
    description?: string | null;
    cardColor?: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    items: { id: string; title: string; note: string | null; category: string | null; sortOrder: number }[];
  },
  stats?: { lastSubmittedAt: Date | null; todayCount: number; recentPartialCount: number },
) {
  return {
    id: location.id,
    name: location.name,
    description: location.description ?? null,
    cardColor: location.cardColor ?? null,
    isActive: location.isActive,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    items: location.items.map((i) => ({
      id: i.id,
      title: i.title,
      note: i.note ?? null,
      category: i.category,
      sortOrder: i.sortOrder,
    })),
    stats: {
      lastSubmittedAt: stats?.lastSubmittedAt?.toISOString() ?? null,
      todayCount: stats?.todayCount ?? 0,
      recentPartialCount: stats?.recentPartialCount ?? 0,
    },
  };
}

async function loadLocationStats(locationIds: string[]) {
  if (locationIds.length === 0) return new Map<string, { lastSubmittedAt: Date | null; todayCount: number; recentPartialCount: number }>();

  const todayStart = startOfTodayUtc();
  const submissions = await prisma.checklistLocationSubmission.findMany({
    where: { locationId: { in: locationIds } },
    select: { locationId: true, submittedAt: true, isComplete: true },
    orderBy: { submittedAt: "desc" },
  });

  const map = new Map<string, { lastSubmittedAt: Date | null; todayCount: number; recentPartialCount: number }>();
  for (const id of locationIds) {
    map.set(id, { lastSubmittedAt: null, todayCount: 0, recentPartialCount: 0 });
  }
  for (const s of submissions) {
    const row = map.get(s.locationId)!;
    if (!row.lastSubmittedAt) row.lastSubmittedAt = s.submittedAt;
    if (s.submittedAt >= todayStart) row.todayCount += 1;
    if (!s.isComplete) row.recentPartialCount += 1;
  }
  return map;
}

// GET /api/teams/:teamId/checklist-locations
checklistLocationsRouter.get("/", async (c) => {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx.error;

  const hasPlan = await requirePlan(ctx.teamId);
  if (!hasPlan) {
    return c.json({ data: { locations: [], planRequired: true, hubToken: null } });
  }

  const hubToken = await ensureTeamChecklistHubToken(ctx.teamId);

  const locations = await prisma.checklistLocation.findMany({
    where: { teamId: ctx.teamId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  const statsMap = await loadLocationStats(locations.map((l) => l.id));
  const recentSubmissions = await prisma.checklistLocationSubmission.findMany({
    where: { location: { teamId: ctx.teamId } },
    include: { location: { select: { id: true, name: true } } },
    orderBy: { submittedAt: "desc" },
    take: 20,
  });

  return c.json({
    data: {
      planRequired: false,
      hubToken,
      locations: locations.map((l) =>
        serializeLocationRow(l, {
          lastSubmittedAt: statsMap.get(l.id)?.lastSubmittedAt ?? null,
          todayCount: statsMap.get(l.id)?.todayCount ?? 0,
          recentPartialCount: statsMap.get(l.id)?.recentPartialCount ?? 0,
        }),
      ),
      recentSubmissions: recentSubmissions.map((s) => ({
        id: s.id,
        locationId: s.locationId,
        locationName: s.location.name,
        submittedAt: s.submittedAt.toISOString(),
        submitterName: s.submitterName,
        checkedCount: s.checkedCount,
        totalCount: s.totalCount,
        isComplete: s.isComplete,
      })),
    },
  });
});

// POST /api/teams/:teamId/checklist-locations
checklistLocationsRouter.post("/", async (c) => {
  const ctx = await requireManager(c);
  if ("error" in ctx) return ctx.error;
  if (!(await requirePlan(ctx.teamId))) {
    return c.json({ error: { message: "Upgrade to Team or Pro to use location checklists", code: "PLAN_REQUIRED" } }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; description?: unknown; cardColor?: unknown; items?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: { message: "Checklist name is required" } }, 400);
  const description =
    typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const cardColor = parseChecklistCardColor(body.cardColor);
  if (body.cardColor !== undefined && cardColor === undefined) {
    return c.json({ error: { message: "Invalid card color" } }, 400);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = parseChecklistItemRows(rawItems);

  await ensureTeamChecklistHubToken(ctx.teamId);

  const location = await prisma.checklistLocation.create({
    data: {
      teamId: ctx.teamId,
      name,
      description,
      cardColor: cardColor ?? null,
      items: { create: items.map((i) => ({ title: i.title, note: i.note, category: i.category, sortOrder: i.sortOrder })) },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  return c.json({ data: serializeLocationRow(location) }, 201);
});

// GET /api/teams/:teamId/checklist-locations/:locationId
checklistLocationsRouter.get("/:locationId", async (c) => {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx.error;

  const locationId = c.req.param("locationId") as string;
  const location = await prisma.checklistLocation.findFirst({
    where: { id: locationId, teamId: ctx.teamId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!location) return c.json({ error: { message: "Not found" } }, 404);

  const statsMap = await loadLocationStats([location.id]);
  const stats = statsMap.get(location.id)!;

  return c.json({
    data: serializeLocationRow(location, {
      lastSubmittedAt: stats.lastSubmittedAt,
      todayCount: stats.todayCount,
      recentPartialCount: stats.recentPartialCount,
    }),
  });
});

// PATCH /api/teams/:teamId/checklist-locations/:locationId
checklistLocationsRouter.patch("/:locationId", async (c) => {
  const ctx = await requireManager(c);
  if ("error" in ctx) return ctx.error;

  const locationId = c.req.param("locationId") as string;
  const existing = await prisma.checklistLocation.findFirst({
    where: { id: locationId, teamId: ctx.teamId },
  });
  if (!existing) return c.json({ error: { message: "Not found" } }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; description?: unknown; cardColor?: unknown; isActive?: unknown };
  const data: { name?: string; description?: string | null; cardColor?: string | null; isActive?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }
  if (body.cardColor !== undefined) {
    const cardColor = parseChecklistCardColor(body.cardColor);
    if (cardColor === undefined) return c.json({ error: { message: "Invalid card color" } }, 400);
    data.cardColor = cardColor;
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (Object.keys(data).length === 0) return c.json({ error: { message: "No changes provided" } }, 400);

  const location = await prisma.checklistLocation.update({
    where: { id: locationId },
    data,
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  return c.json({ data: serializeLocationRow(location) });
});

// PUT /api/teams/:teamId/checklist-locations/:locationId/items
checklistLocationsRouter.put("/:locationId/items", async (c) => {
  const ctx = await requireManager(c);
  if ("error" in ctx) return ctx.error;

  const locationId = c.req.param("locationId") as string;
  const existing = await prisma.checklistLocation.findFirst({
    where: { id: locationId, teamId: ctx.teamId },
  });
  if (!existing) return c.json({ error: { message: "Not found" } }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { items?: unknown };
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = parseChecklistItemRows(rawItems);

  const location = await prisma.$transaction(async (tx) => {
    await tx.checklistLocationItem.deleteMany({ where: { locationId } });
    await tx.checklistLocationItem.createMany({
      data: items.map((i) => ({ locationId, title: i.title, note: i.note, category: i.category, sortOrder: i.sortOrder })),
    });
    return tx.checklistLocation.findUniqueOrThrow({
      where: { id: locationId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return c.json({ data: serializeLocationRow(location) });
});

// DELETE /api/teams/:teamId/checklist-locations/:locationId
checklistLocationsRouter.delete("/:locationId", async (c) => {
  const ctx = await requireManager(c);
  if ("error" in ctx) return ctx.error;

  const locationId = c.req.param("locationId") as string;
  const existing = await prisma.checklistLocation.findFirst({
    where: { id: locationId, teamId: ctx.teamId },
    include: { _count: { select: { submissions: true } } },
  });
  if (!existing) return c.json({ error: { message: "Not found" } }, 404);

  if (existing._count.submissions > 0) {
    await prisma.checklistLocation.update({
      where: { id: locationId },
      data: { isActive: false },
    });
    return c.json({ data: { deactivated: true } });
  }

  await prisma.checklistLocation.delete({ where: { id: locationId } });
  return c.json({ data: { deleted: true } });
});

// GET /api/teams/:teamId/checklist-locations/:locationId/submissions
checklistLocationsRouter.get("/:locationId/submissions", async (c) => {
  const ctx = await requireMember(c);
  if ("error" in ctx) return ctx.error;

  const locationId = c.req.param("locationId") as string;
  const location = await prisma.checklistLocation.findFirst({
    where: { id: locationId, teamId: ctx.teamId },
  });
  if (!location) return c.json({ error: { message: "Not found" } }, 404);

  const sinceRaw = c.req.query("since")?.trim();
  const limitRaw = Number(c.req.query("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  const cursor = c.req.query("cursor")?.trim();

  const since = sinceRaw ? new Date(sinceRaw) : null;
  const where = {
    locationId,
    ...(since && !Number.isNaN(since.getTime()) ? { submittedAt: { gte: since } } : {}),
    ...(cursor ? { id: { lt: cursor } } : {}),
  };

  const rows = await prisma.checklistLocationSubmission.findMany({
    where,
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return c.json({
    data: page.map((s) => ({
      id: s.id,
      submittedAt: s.submittedAt.toISOString(),
      submitterName: s.submitterName,
      checkedCount: s.checkedCount,
      totalCount: s.totalCount,
      isComplete: s.isComplete,
      responses: s.responses,
    })),
    nextCursor,
  });
});

export { checklistLocationsRouter };
