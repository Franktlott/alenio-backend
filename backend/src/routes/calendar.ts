import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { logActivity } from "../lib/activity";
import { sendPushToUsers } from "../lib/push";
import { validateVideoMeetingSchedule } from "../lib/video-meeting-duration";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const calendarRouter = new Hono<{ Variables: Variables }>();

calendarRouter.use("*", authGuard);

// In-memory map of scheduled reminder timeouts per event
const pendingReminders = new Map<string, ReturnType<typeof setTimeout>[]>();

function parseMeetingSettings(raw: string | null | undefined): { reminderMinutes: number[]; assigneeIds: string[] } {
  if (!raw) return { reminderMinutes: [], assigneeIds: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        reminderMinutes: parsed.filter((v): v is number => typeof v === "number"),
        assigneeIds: [],
      };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { reminderMinutes?: unknown; assigneeIds?: unknown; minutes?: unknown };
      const minsSource = Array.isArray(obj.reminderMinutes) ? obj.reminderMinutes : Array.isArray(obj.minutes) ? obj.minutes : [];
      return {
        reminderMinutes: minsSource.filter((v): v is number => typeof v === "number"),
        assigneeIds: Array.isArray(obj.assigneeIds) ? obj.assigneeIds.filter((v): v is string => typeof v === "string") : [],
      };
    }
  } catch {
    // Ignore malformed legacy data
  }
  return { reminderMinutes: [], assigneeIds: [] };
}

function formatReminderLabel(mins: number): string {
  if (mins === 0) return "is starting now";
  if (mins < 60) return `starts in ${mins} minute${mins !== 1 ? "s" : ""}`;
  const hrs = mins / 60;
  return `starts in ${hrs} hour${hrs !== 1 ? "s" : ""}`;
}

async function scheduleEventReminders(
  eventId: string,
  eventTitle: string,
  teamId: string,
  startDate: Date,
  reminderMinutes: number[],
  assigneeIds: string[] = []
) {
  // Cancel any existing reminders for this event
  const existing = pendingReminders.get(eventId);
  if (existing) {
    existing.forEach((t) => clearTimeout(t));
    pendingReminders.delete(eventId);
  }

  if (reminderMinutes.length === 0) return;

  const handles: ReturnType<typeof setTimeout>[] = [];
  const now = Date.now();

  for (const mins of reminderMinutes) {
    const fireAt = startDate.getTime() - mins * 60 * 1000;
    const delay = fireAt - now;
    if (delay <= 0) continue; // already past

    const handle = setTimeout(async () => {
      try {
        const members = await prisma.teamMember.findMany({
          where: { teamId },
          select: { userId: true },
        });
        const allUserIds = members.map((m) => m.userId);
        const targetUserIds = assigneeIds.length > 0
          ? allUserIds.filter((id) => assigneeIds.includes(id))
          : allUserIds;
        if (targetUserIds.length === 0) return;
        await sendPushToUsers(
          targetUserIds,
          "Meeting Reminder",
          `${eventTitle} ${formatReminderLabel(mins)}`,
          { eventId, type: "meeting_reminder" },
          "notifMeetings",
          teamId
        );
      } catch {
        // Non-critical
      }
    }, delay);

    handles.push(handle);
  }

  if (handles.length > 0) {
    pendingReminders.set(eventId, handles);
  }
}

// Re-schedule reminders for upcoming events on startup
export async function initMeetingReminders() {
  try {
    const upcoming = await prisma.calendarEvent.findMany({
      where: {
        isVideoMeeting: true,
        startDate: { gt: new Date() },
      },
      select: { id: true, title: true, teamId: true, startDate: true, reminderMinutes: true },
    });

    for (const event of upcoming) {
      const settings = parseMeetingSettings(event.reminderMinutes);
      const mins = settings.reminderMinutes;
      if (mins.length > 0) {
        await scheduleEventReminders(event.id, event.title, event.teamId, event.startDate, mins, settings.assigneeIds);
      }
    }
  } catch {
    // Non-critical
  }
}

// GET /api/teams/:teamId/events — all team members can view
calendarRouter.get("/:teamId/events", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "Team not found or not a member", code: "NOT_FOUND" } }, 404);
  }

  // Show all non-hidden events, plus hidden events created by or assigned to the current user.
  const allEvents = await prisma.calendarEvent.findMany({
    where: { teamId },
    orderBy: { startDate: "asc" },
    include: {
      createdBy: { select: { id: true, name: true, image: true } },
    },
  });
  const events = allEvents
    .filter((event) => {
      if (!event.isHidden) return true;
      if (event.createdById === user.id) return true;
      if (!event.isVideoMeeting) return false;
      const settings = parseMeetingSettings(event.reminderMinutes);
      return settings.assigneeIds.includes(user.id);
    })
    .map((event) => {
      const settings = parseMeetingSettings(event.reminderMinutes);
      return {
        ...event,
        assigneeIds: settings.assigneeIds,
      };
    });

  return c.json({ data: events });
});

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
  isHidden: z.boolean().optional(),
  isVideoMeeting: z.boolean().optional().default(false),
  reminderMinutes: z.array(z.number()).optional().default([]),
  assigneeIds: z.array(z.string()).optional().default([]),
});
calendarRouter.post(
  "/:teamId/events",
  zValidator("json", createEventSchema),
  async (c) => {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const body = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership) {
      return c.json({ error: { message: "You are not a member of this team", code: "FORBIDDEN" } }, 403);
    }

    const isOwnerOrLeader = ["owner", "team_leader"].includes(membership.role);
    let forcePrivate = false;

    if (!isOwnerOrLeader) {
      const subscription = await prisma.teamSubscription.findUnique({ where: { teamId } });
      const isPaid = subscription && ["team", "pro"].includes(subscription.plan);
      if (!isPaid) {
        return c.json({ error: { message: "Only team owners can create events on the free plan", code: "FORBIDDEN" } }, 403);
      }
      forcePrivate = true;
    }

    const reminderMins = body.reminderMinutes ?? [];
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    const teamMemberIds = new Set(teamMembers.map((m) => m.userId));
    const assigneeIds = Array.from(
      new Set([...(body.assigneeIds ?? []).filter((id) => teamMemberIds.has(id)), user.id])
    );

    const start = new Date(body.startDate);
    const end = body.endDate ? new Date(body.endDate) : null;
    const isVideoMeeting = body.isVideoMeeting ?? false;
    if (isVideoMeeting) {
      const scheduleError = validateVideoMeetingSchedule(start, end);
      if (scheduleError) {
        return c.json({ error: { message: scheduleError, code: "BAD_REQUEST" } }, 400);
      }
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title: body.title,
        description: body.description,
        startDate: start,
        endDate: end,
        allDay: isVideoMeeting ? false : (body.allDay ?? true),
        color: body.color ?? "#4361EE",
        isHidden: forcePrivate ? true : (body.isHidden ?? false),
        isVideoMeeting,
        reminderMinutes: JSON.stringify({ reminderMinutes: reminderMins, assigneeIds }),
        teamId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

    if (body.isVideoMeeting && reminderMins.length > 0) {
      await scheduleEventReminders(event.id, event.title, teamId, event.startDate, reminderMins, assigneeIds);
    }

    await logActivity({
      teamId,
      userId: user.id,
      type: "calendar_event_added",
      metadata: { eventTitles: [event.title], eventCount: 1, isVideoMeeting: event.isVideoMeeting, startDate: event.startDate.toISOString(), allDay: event.allDay },
    });

    return c.json({ data: { ...event, assigneeIds } }, 201);
  }
);

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
  isHidden: z.boolean().optional(),
  isVideoMeeting: z.boolean().optional(),
  reminderMinutes: z.array(z.number()).optional(),
  assigneeIds: z.array(z.string()).optional(),
});

// PATCH /api/teams/:teamId/events/:eventId — owner only
calendarRouter.patch(
  "/:teamId/events/:eventId",
  zValidator("json", updateEventSchema),
  async (c) => {
    const user = c.get("user")!;
    const { teamId, eventId } = c.req.param();
    const body = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership || !["owner","team_leader"].includes(membership.role)) {
      return c.json({ error: { message: "Only team owners can update events", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing || existing.teamId !== teamId) {
      return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }

    const existingSettings = parseMeetingSettings(existing.reminderMinutes);
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    const teamMemberIds = new Set(teamMembers.map((m) => m.userId));
    const nextAssigneeIds = body.assigneeIds !== undefined
      ? Array.from(new Set([...body.assigneeIds.filter((id) => teamMemberIds.has(id)), existing.createdById]))
      : existingSettings.assigneeIds;
    const nextReminderMinutes = body.reminderMinutes ?? existingSettings.reminderMinutes;

    const nextStart = body.startDate !== undefined ? new Date(body.startDate) : existing.startDate;
    const nextEnd =
      body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : existing.endDate;
    const nextIsVideoMeeting =
      body.isVideoMeeting !== undefined ? body.isVideoMeeting : existing.isVideoMeeting;
    if (nextIsVideoMeeting) {
      const scheduleError = validateVideoMeetingSchedule(nextStart, nextEnd);
      if (scheduleError) {
        return c.json({ error: { message: scheduleError, code: "BAD_REQUEST" } }, 400);
      }
    }

    const updated = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.startDate !== undefined ? { startDate: nextStart } : {}),
        ...(body.endDate !== undefined ? { endDate: nextEnd } : {}),
        ...(body.allDay !== undefined ? { allDay: nextIsVideoMeeting ? false : body.allDay } : nextIsVideoMeeting ? { allDay: false } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.isHidden !== undefined ? { isHidden: body.isHidden } : {}),
        ...(body.isVideoMeeting !== undefined ? { isVideoMeeting: body.isVideoMeeting } : {}),
        reminderMinutes: JSON.stringify({
          reminderMinutes: nextReminderMinutes,
          assigneeIds: nextAssigneeIds,
        }),
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

    // Re-schedule reminders if relevant fields changed
    const isVideo = body.isVideoMeeting !== undefined ? body.isVideoMeeting : existing.isVideoMeeting;
    if (isVideo && (body.reminderMinutes !== undefined || body.startDate !== undefined)) {
      await scheduleEventReminders(
        updated.id,
        updated.title,
        teamId,
        updated.startDate,
        nextReminderMinutes,
        nextAssigneeIds
      );
    }

    return c.json({ data: { ...updated, assigneeIds: nextAssigneeIds } });
  }
);

// DELETE /api/teams/:teamId/events/:eventId — owner only
calendarRouter.delete("/:teamId/events/:eventId", async (c) => {
  const user = c.get("user")!;
  const { teamId, eventId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership || !["owner","team_leader"].includes(membership.role)) {
    return c.json({ error: { message: "Only team owners can delete events", code: "FORBIDDEN" } }, 403);
  }

  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!existing || existing.teamId !== teamId) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  // Cancel any pending reminders
  const handles = pendingReminders.get(eventId);
  if (handles) {
    handles.forEach((t) => clearTimeout(t));
    pendingReminders.delete(eventId);
  }

  await prisma.calendarEvent.delete({ where: { id: eventId } });

  return c.body(null, 204);
});

export { calendarRouter };
