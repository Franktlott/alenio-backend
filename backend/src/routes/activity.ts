import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const activityRouter = new Hono<{ Variables: Variables }>();

const ACTIVITY_FEED_DAYS = 14;

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

  const feedStart = new Date(Date.now() - ACTIVITY_FEED_DAYS * 24 * 60 * 60 * 1000);

  const activities = await prisma.teamActivity.findMany({
    where: { teamId, createdAt: { gte: feedStart } },
    include: {
      user: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return c.json({
    data: activities.map((a) => ({
      id: a.id,
      teamId,
      type: a.type,
      createdAt: a.createdAt,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      user: a.user,
      reactions: a.reactions.reduce((acc: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userIds: [], users: [] };
        acc[r.emoji]!.count++;
        acc[r.emoji]!.userIds.push(r.userId);
        acc[r.emoji]!.users.push({ id: r.user.id, name: r.user.name });
        return acc;
      }, {}),
    })),
  });
});

activityRouter.post(
  "/:teamId/activity/celebrate",
  zValidator("json", z.object({
    targetUserId: z.string(),
    celebrationType: z.string(),
    message: z.string().max(300).optional(),
  })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const { targetUserId, celebrationType, message } = c.req.valid("json");

    const [membership, targetMember] = await Promise.all([
      prisma.teamMember.findUnique({ where: { userId_teamId: { userId: user.id, teamId } } }),
      prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: targetUserId, teamId } },
        include: { user: { select: { id: true, name: true, image: true } } },
      }),
    ]);
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    if (!targetMember) return c.json({ error: { message: "Target not a team member", code: "NOT_FOUND" } }, 404);

    const activity = await prisma.teamActivity.create({
      data: {
        teamId,
        userId: user.id,
        type: "celebration",
        metadata: JSON.stringify({
          targetUserId,
          targetName: targetMember.user.name,
          targetUserImage: targetMember.user.image ?? null,
          celebrationType,
          message: message?.trim() || null,
        }),
      },
    });

    return c.json({ data: { id: activity.id } }, 201);
  }
);

activityRouter.post(
  "/:teamId/activity/:activityId/react",
  zValidator("json", z.object({ emoji: z.string() })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId, activityId } = c.req.param();
    const { emoji } = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    // Find any existing reaction from this user on this activity (one reaction per user max)
    const existingAny = await prisma.teamActivityReaction.findFirst({
      where: { activityId, userId: user.id },
    });

    if (existingAny) {
      // Always remove the existing reaction first
      await prisma.teamActivityReaction.delete({ where: { id: existingAny.id } });
      if (existingAny.emoji !== emoji) {
        // Different emoji → swap in the new one
        await prisma.teamActivityReaction.create({ data: { emoji, userId: user.id, activityId } });
        return c.json({ data: { toggled: true } });
      }
      // Same emoji → just removed (toggle off)
      return c.json({ data: { toggled: false } });
    }

    await prisma.teamActivityReaction.create({ data: { emoji, userId: user.id, activityId } });
    return c.json({ data: { toggled: true } });
  }
);

activityRouter.delete("/:teamId/activity/:activityId", async (c) => {
  const user = c.get("user")!;
  const { teamId, activityId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const activity = await prisma.teamActivity.findFirst({
    where: { id: activityId, teamId },
  });
  if (!activity) {
    return c.json({ error: { message: "Activity not found", code: "NOT_FOUND" } }, 404);
  }
  if (activity.type !== "celebration") {
    return c.json({ error: { message: "Only celebrations can be deleted", code: "FORBIDDEN" } }, 403);
  }

  const isCreator = activity.userId === user.id;
  const isOwnerOrAdmin = ["owner", "admin"].includes(membership.role);
  if (!isCreator && !isOwnerOrAdmin) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  await prisma.teamActivity.delete({ where: { id: activityId } });
  return c.body(null, 204);
});

const RECOGNITION_TYPE_KEYS = [
  "leadership",
  "customer_service",
  "teamwork",
  "operational_excellence",
  "beyond",
] as const;

type RecognitionTypeKey = (typeof RECOGNITION_TYPE_KEYS)[number];

function isRecognitionTypeKey(value: string): value is RecognitionTypeKey {
  return (RECOGNITION_TYPE_KEYS as readonly string[]).includes(value);
}

function parseActivityMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

activityRouter.get("/:teamId/recognitions", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();
  const range = (c.req.query("range") ?? "month").toLowerCase();
  const typeFilter = c.req.query("type")?.trim() || null;
  const limitRaw = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 20;
  const cursor = c.req.query("cursor")?.trim() || null;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const ownerMember = await prisma.teamMember.findFirst({
    where: { teamId, role: "owner" },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = addMonths(thisMonthStart, -1);
  const nextMonthStart = addMonths(thisMonthStart, 1);
  const last30Start = daysAgo(30);
  const prior30Start = daysAgo(60);

  const oldestNeeded = daysAgo(400);
  const celebrations = await prisma.teamActivity.findMany({
    where: {
      teamId,
      type: "celebration",
      createdAt: { gte: oldestNeeded },
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  type ParsedCelebration = {
    id: string;
    createdAt: Date;
    giver: { id: string; name: string | null; email: string | null; image: string | null } | null;
    targetUserId: string | null;
    targetName: string | null;
    targetUserImage: string | null;
    celebrationType: string;
    message: string | null;
    reactions: Record<string, { count: number; userIds: string[]; users: { id: string; name: string | null }[] }>;
  };

  const parsed: ParsedCelebration[] = celebrations.map((a) => {
    const meta = parseActivityMetadata(a.metadata);
    const celebrationType =
      typeof meta?.celebrationType === "string" && meta.celebrationType.trim()
        ? meta.celebrationType.trim()
        : "other";
    return {
      id: a.id,
      createdAt: a.createdAt,
      giver: a.user,
      targetUserId: typeof meta?.targetUserId === "string" ? meta.targetUserId : null,
      targetName: typeof meta?.targetName === "string" ? meta.targetName : null,
      targetUserImage: typeof meta?.targetUserImage === "string" ? meta.targetUserImage : null,
      celebrationType,
      message: typeof meta?.message === "string" ? meta.message : null,
      reactions: a.reactions.reduce(
        (
          acc: Record<string, { count: number; userIds: string[]; users: { id: string; name: string | null }[] }>,
          r,
        ) => {
          if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userIds: [], users: [] };
          acc[r.emoji]!.count++;
          acc[r.emoji]!.userIds.push(r.userId);
          acc[r.emoji]!.users.push({ id: r.user.id, name: r.user.name });
          return acc;
        },
        {},
      ),
    };
  });

  const inRange = (item: ParsedCelebration, start: Date, endExclusive?: Date) => {
    if (item.createdAt < start) return false;
    if (endExclusive && item.createdAt >= endExclusive) return false;
    return true;
  };

  const thisMonth = parsed.filter((p) => inRange(p, thisMonthStart, nextMonthStart));
  const lastMonth = parsed.filter((p) => inRange(p, lastMonthStart, thisMonthStart));
  const last30 = parsed.filter((p) => inRange(p, last30Start));
  const prior30 = parsed.filter((p) => inRange(p, prior30Start, last30Start));

  const uniqueTargets = (items: ParsedCelebration[]) =>
    new Set(items.map((i) => i.targetUserId).filter(Boolean)).size;

  const giverCounts = (items: ParsedCelebration[]) => {
    const map = new Map<
      string,
      { userId: string; name: string | null; image: string | null; count: number }
    >();
    for (const item of items) {
      if (!item.giver?.id) continue;
      const existing = map.get(item.giver.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.giver.id, {
          userId: item.giver.id,
          name: item.giver.name,
          image: item.giver.image,
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (a.name ?? "").localeCompare(b.name ?? ""));
  };

  const monthGivers = giverCounts(thisMonth);
  const topRecognizer = monthGivers[0] ?? null;

  const breakdownSource =
    range === "30d" ? last30 : range === "all" ? parsed : thisMonth;

  const breakdownCounts: Record<RecognitionTypeKey | "other", number> = {
    leadership: 0,
    customer_service: 0,
    teamwork: 0,
    operational_excellence: 0,
    beyond: 0,
    other: 0,
  };
  for (const item of breakdownSource) {
    if (isRecognitionTypeKey(item.celebrationType)) {
      breakdownCounts[item.celebrationType] += 1;
    } else {
      breakdownCounts.other += 1;
    }
  }

  let feedSource =
    range === "30d" ? last30 : range === "all" ? parsed : thisMonth;
  if (typeFilter && typeFilter !== "all") {
    if (typeFilter === "other") {
      feedSource = feedSource.filter((i) => !isRecognitionTypeKey(i.celebrationType));
    } else {
      feedSource = feedSource.filter((i) => i.celebrationType === typeFilter);
    }
  }

  let startIndex = 0;
  if (cursor) {
    const idx = feedSource.findIndex((i) => i.id === cursor);
    startIndex = idx >= 0 ? idx + 1 : 0;
  }
  const pageItems = feedSource.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < feedSource.length ? pageItems[pageItems.length - 1]?.id ?? null : null;

  const topRecognizersSource =
    range === "30d" ? giverCounts(last30) : range === "all" ? giverCounts(parsed) : monthGivers;

  return c.json({
    data: {
      owner: ownerMember
        ? {
            id: ownerMember.user.id,
            name: ownerMember.user.name,
            email: ownerMember.user.email,
            image: ownerMember.user.image,
          }
        : null,
      kpis: {
        recognitionsGivenThisMonth: thisMonth.length,
        recognitionsGivenLastMonth: lastMonth.length,
        recognitionsGivenChangePct: percentChange(thisMonth.length, lastMonth.length),
        teamMembersRecognizedThisMonth: uniqueTargets(thisMonth),
        totalLast30Days: last30.length,
        totalPrior30Days: prior30.length,
        totalChangePct: percentChange(last30.length, prior30.length),
        topRecognizer: topRecognizer
          ? {
              userId: topRecognizer.userId,
              name: topRecognizer.name,
              image: topRecognizer.image,
              count: topRecognizer.count,
              isCurrentUser: topRecognizer.userId === user.id,
            }
          : null,
      },
      breakdown: [
        ...RECOGNITION_TYPE_KEYS.map((key) => ({
          key,
          count: breakdownCounts[key],
        })),
        { key: "other" as const, count: breakdownCounts.other },
      ],
      topRecognizers: topRecognizersSource.slice(0, 10).map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: row.name,
        image: row.image,
        count: row.count,
        isCurrentUser: row.userId === user.id,
      })),
      items: pageItems.map((item) => ({
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        celebrationType: item.celebrationType,
        message: item.message,
        giver: item.giver
          ? {
              id: item.giver.id,
              name: item.giver.name,
              image: item.giver.image,
            }
          : null,
        target: {
          id: item.targetUserId,
          name: item.targetName,
          image: item.targetUserImage,
        },
        reactions: item.reactions,
        visibility: "public" as const,
      })),
      nextCursor,
      range,
      typeFilter: typeFilter ?? "all",
    },
  });
});

export { activityRouter };
