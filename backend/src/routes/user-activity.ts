import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { buildConnectionPairKey } from "../lib/messaging-permission";
import { isBlockedEitherDirection } from "../lib/relationship-blocks";
import { canViewCalendarEvent } from "../lib/calendar-permissions";
import { taskVisibilityWhere } from "../lib/task-policy";
import {
  calendarDayFromInstant,
  instantFromCalendarDateAndTime,
  resolveTimeZone,
} from "../lib/timezone";
import type { HomeTodayItem } from "../types";
import {
  canDeleteSentRecognition,
  sentRecognitionDeleteUntil,
} from "../lib/recognition-delete-policy";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const userActivityRouter = new Hono<{ Variables: Variables }>();

const ACTIVITY_FEED_DAYS = 14;
const ACTIVITY_FEED_LIMIT = 150;
const PERSONAL_RECOGNITION_PAGE_SIZE = 20;
const PERSONAL_RECOGNITION_VISIBLE_LIMIT = 50;

userActivityRouter.use("*", authGuard);

function mapReactions(
  reactions: {
    emoji: string;
    userId: string;
    user: { id: string; name: string };
  }[],
) {
  return reactions.reduce(
    (acc: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userIds: [], users: [] };
      acc[r.emoji]!.count++;
      acc[r.emoji]!.userIds.push(r.userId);
      acc[r.emoji]!.users.push({ id: r.user.id, name: r.user.name });
      return acc;
    },
    {},
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
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

/** Recognition received and given by the signed-in user across their Alenio history. */
userActivityRouter.get("/recognitions", async (c) => {
  const user = c.get("user")!;
  const requestedOffset = Number.parseInt(c.req.query("offset") ?? "0", 10);
  const requestedLimit = Number.parseInt(
    c.req.query("limit") ?? String(PERSONAL_RECOGNITION_PAGE_SIZE),
    10,
  );
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(requestedOffset, 0), PERSONAL_RECOGNITION_VISIBLE_LIMIT)
    : 0;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(
        Math.max(requestedLimit, 1),
        PERSONAL_RECOGNITION_PAGE_SIZE,
        PERSONAL_RECOGNITION_VISIBLE_LIMIT - offset,
      )
    : PERSONAL_RECOGNITION_PAGE_SIZE;
  const targetUserNeedle = `"targetUserId":"${user.id}"`;
  const receivedWhere = {
    type: "celebration",
    metadata: { contains: targetUserNeedle },
  };
  const givenWhere = {
    type: "celebration",
    userId: user.id,
    metadata: { contains: `"targetUserId":` },
  };

  const [total, recognitions, givenTotal, givenRecognitions] = await Promise.all([
    prisma.teamActivity.count({ where: receivedWhere }),
    prisma.teamActivity.findMany({
      where: receivedWhere,
      include: {
        team: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.teamActivity.count({ where: givenWhere }),
    prisma.teamActivity.findMany({
      where: givenWhere,
      include: {
        team: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);

  return c.json({
    data: {
      total,
      items: recognitions.map((recognition) => {
        const metadata = parseMetadata(recognition.metadata);
        return {
          id: recognition.id,
          createdAt: recognition.createdAt.toISOString(),
          canDelete: true,
          deleteUntil: null,
          celebrationType:
            typeof metadata?.celebrationType === "string"
              ? metadata.celebrationType
              : "recognition",
          message:
            typeof metadata?.message === "string" ? metadata.message : null,
          workspace: recognition.team,
          giver: recognition.user,
          recipient: {
            id: user.id,
            name: user.name,
            image: user.image,
          },
        };
      }),
      givenTotal,
      givenItems: givenRecognitions.map((recognition) => {
        const metadata = parseMetadata(recognition.metadata);
        return {
          id: recognition.id,
          createdAt: recognition.createdAt.toISOString(),
          canDelete: canDeleteSentRecognition(recognition.createdAt),
          deleteUntil: sentRecognitionDeleteUntil(recognition.createdAt).toISOString(),
          celebrationType:
            typeof metadata?.celebrationType === "string"
              ? metadata.celebrationType
              : "recognition",
          message:
            typeof metadata?.message === "string" ? metadata.message : null,
          workspace: recognition.team,
          giver: recognition.user,
          recipient:
            typeof metadata?.targetUserId === "string"
              ? {
                  id: metadata.targetUserId,
                  name:
                    typeof metadata.targetName === "string"
                      ? metadata.targetName
                      : null,
                  image:
                    typeof metadata.targetUserImage === "string"
                      ? metadata.targetUserImage
                      : null,
                }
              : null,
        };
      }),
    },
  });
});

/** Send account-level recognition to an accepted Alenio connection. */
userActivityRouter.post(
  "/recognitions",
  zValidator(
    "json",
    z.object({
      targetUserId: z.string().min(1),
      celebrationType: z.string().min(1).max(60),
      message: z.string().trim().min(1).max(300),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { targetUserId, celebrationType, message } = c.req.valid("json");
    if (targetUserId === user.id) {
      return c.json(
        { error: { message: "Choose one of your connections", code: "INVALID_TARGET" } },
        400,
      );
    }

    const [connection, target, blocked] = await Promise.all([
      prisma.connection.findUnique({
        where: { pairKey: buildConnectionPairKey(user.id, targetUserId) },
        select: { status: true },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, image: true },
      }),
      isBlockedEitherDirection(user.id, targetUserId),
    ]);

    if (!target || connection?.status !== "accepted" || blocked) {
      return c.json(
        {
          error: {
            message: "Recognition can only be sent to an active connection",
            code: "CONNECTION_REQUIRED",
          },
        },
        403,
      );
    }

    const recognition = await prisma.teamActivity.create({
      data: {
        teamId: null,
        userId: user.id,
        type: "celebration",
        metadata: JSON.stringify({
          targetUserId: target.id,
          targetName: target.name,
          targetUserImage: target.image,
          celebrationType,
          message,
        }),
      },
    });

    return c.json({ data: { id: recognition.id } }, 201);
  },
);

/** Recipients may delete at any time; senders have a five-minute undo window. */
userActivityRouter.delete("/recognitions/:recognitionId", async (c) => {
  const user = c.get("user")!;
  const { recognitionId } = c.req.param();
  const recognition = await prisma.teamActivity.findUnique({
    where: { id: recognitionId },
    select: { id: true, type: true, metadata: true, userId: true, createdAt: true },
  });
  const metadata = recognition ? parseMetadata(recognition.metadata) : null;

  if (!recognition || recognition.type !== "celebration") {
    return c.json(
      { error: { message: "Recognition not found", code: "NOT_FOUND" } },
      404,
    );
  }

  const isRecipient = metadata?.targetUserId === user.id;
  const isSender = recognition.userId === user.id;
  if (!isRecipient && !isSender) {
    return c.json(
      { error: { message: "Recognition not found", code: "NOT_FOUND" } },
      404,
    );
  }
  if (isSender && !isRecipient && !canDeleteSentRecognition(recognition.createdAt)) {
    return c.json(
      {
        error: {
          message: "Sent recognition can only be deleted within five minutes.",
          code: "DELETE_WINDOW_EXPIRED",
        },
      },
      403,
    );
  }

  await prisma.teamActivity.delete({ where: { id: recognition.id } });
  return c.body(null, 204);
});

const todayQuerySchema = z.object({
  timeZone: z.string().optional(),
});

/** Items on the signed-in user's calendar today, across every workspace. */
userActivityRouter.get(
  "/today",
  zValidator("query", todayQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const requestedTimeZone = c.req.valid("query").timeZone;
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { timezone: true },
    });
    const timeZone = resolveTimeZone(profile?.timezone || requestedTimeZone);
    const date = calendarDayFromInstant(new Date(), timeZone);
    const [year, month, day] = date.split("-").map(Number);
    const nextDayUtc = new Date(Date.UTC(year!, month! - 1, day! + 1));
    const nextDate = `${nextDayUtc.getUTCFullYear()}-${String(
      nextDayUtc.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(nextDayUtc.getUTCDate()).padStart(2, "0")}`;
    const start = instantFromCalendarDateAndTime(date, 0, 0, timeZone);
    const end = instantFromCalendarDateAndTime(nextDate, 0, 0, timeZone);

    const memberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      select: { teamId: true, role: true },
    });
    const teamIds = memberships.map((membership) => membership.teamId);
    const roleByTeamId = new Map(
      memberships.map((membership) => [membership.teamId, membership.role]),
    );

    const [assignments, events, externalEvents] = await Promise.all([
      prisma.taskAssignment.findMany({
        where: {
          userId: user.id,
          task: {
            AND: [
              taskVisibilityWhere(user.id),
              {
                status: "todo",
                archivedAt: null,
                dueDate: { gte: start, lt: end },
              },
            ],
          },
        },
        select: {
          task: {
            select: {
              id: true,
              title: true,
              kind: true,
              dueDate: true,
              team: { select: { id: true, name: true } },
            },
          },
        },
      }),
      teamIds.length > 0
        ? prisma.calendarEvent.findMany({
            where: {
              teamId: { in: teamIds },
              startDate: { lt: end },
              OR: [
                { startDate: { gte: start } },
                { endDate: { gt: start } },
              ],
            },
            include: {
              team: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      prisma.externalCalendarEvent.findMany({
        where: {
          userId: user.id,
          startDate: { lt: end },
          OR: [
            { startDate: { gte: start } },
            { endDate: { gt: start } },
          ],
        },
      }),
    ]);

    const taskItems: HomeTodayItem[] = assignments
      .filter(({ task }) => task.dueDate)
      .map(({ task }) => ({
        id: task.id,
        type: task.kind === "reminder" ? "reminder" : "task",
        title: task.title,
        startAt: task.dueDate!.toISOString(),
        endAt: null,
        allDay: false,
        workspace: task.team,
      }));

    const eventItems: HomeTodayItem[] = events.flatMap((event) => {
      let assigneeIds: string[] = [];
      try {
        const settings = JSON.parse(event.reminderMinutes) as unknown;
        if (
          settings &&
          typeof settings === "object" &&
          !Array.isArray(settings) &&
          Array.isArray((settings as { assigneeIds?: unknown }).assigneeIds)
        ) {
          assigneeIds = (
            settings as { assigneeIds: unknown[] }
          ).assigneeIds.filter((id): id is string => typeof id === "string");
        }
      } catch {
        // Legacy reminder data can be malformed; visibility safely defaults.
      }

      const role = roleByTeamId.get(event.teamId);
      if (
        !role ||
        !canViewCalendarEvent(event, user.id, role, assigneeIds)
      ) {
        return [];
      }

      return [{
        id: event.id,
        type: event.isOneOnOne
          ? "check_in"
          : event.isVideoMeeting
            ? "meeting"
            : "event",
        title: event.title,
        startAt: event.startDate.toISOString(),
        endAt: event.endDate?.toISOString() ?? null,
        allDay: event.allDay,
        workspace: event.team,
      } satisfies HomeTodayItem];
    });

    const externalItems: HomeTodayItem[] = externalEvents.map((event) => ({
      id: event.id,
      type: "external",
      title: event.titleDisplay,
      startAt: event.startDate.toISOString(),
      endAt: event.endDate?.toISOString() ?? null,
      allDay: event.allDay,
      workspace: null,
    }));

    const items = [...taskItems, ...eventItems, ...externalItems].sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

    return c.json({
      data: {
        date,
        timeZone,
        dateStart: start.toISOString(),
        dateEnd: end.toISOString(),
        items,
      },
    });
  },
);

/** Cross-workspace activity feed for the signed-in user. */
userActivityRouter.get("/", async (c) => {
  const user = c.get("user")!;

  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  const feedStart = new Date(Date.now() - ACTIVITY_FEED_DAYS * 24 * 60 * 60 * 1000);

  // Workspace activity from every workspace you belong to, plus your own
  // account-level activity, which has no teamId and outlives any employer.
  const activities = await prisma.teamActivity.findMany({
    where: {
      createdAt: { gte: feedStart },
      OR: [
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        { teamId: null, userId: user.id },
        {
          teamId: null,
          type: "celebration",
          metadata: { contains: `"targetUserId":"${user.id}"` },
        },
        {
          userId: user.id,
          type: { in: ["member_joined", "member_removed"] },
        },
      ],
    },
    include: {
      team: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, image: true } },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: ACTIVITY_FEED_LIMIT,
  });

  return c.json({
    data: activities.map((a) => ({
      id: a.id,
      teamId: a.teamId,
      team: a.team,
      type: a.type,
      createdAt: a.createdAt,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      user: a.user,
      reactions: mapReactions(a.reactions),
    })),
  });
});

export { userActivityRouter };
