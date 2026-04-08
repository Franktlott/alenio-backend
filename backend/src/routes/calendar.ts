import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { logActivity } from "../lib/activity";
import { sendPushToUsers } from "../lib/push";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const calendarRouter = new Hono<{ Variables: Variables }>();

calendarRouter.use("*", authGuard);

// In-memory map of scheduled reminder timeouts per event
const pendingReminders = new Map<string, ReturnType<typeof setTimeout>[]>();

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
  reminderMinutes: number[]
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
        const userIds = members.map((m) => m.userId);
        await sendPushToUsers(
          userIds,
          "Meeting Reminder",
          `${eventTitle} ${formatReminderLabel(mins)}`,
          { eventId, type: "meeting_reminder" },
          "notifMeetings"
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
      const mins: number[] = JSON.parse(event.reminderMinutes || "[]");
      if (mins.length > 0) {
        await scheduleEventReminders(event.id, event.title, event.teamId, event.startDate, mins);
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

  // Show all non-hidden events, plus hidden events created by the current user
  const events = await prisma.calendarEvent.findMany({
    where: {
      teamId,
      OR: [
        { isHidden: false },
        { isHidden: true, createdById: user.id },
      ],
    },
    orderBy: { startDate: "asc" },
    include: {
      createdBy: { select: { id: true, name: true, image: true } },
    },
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
    if (!membership || !["owner","team_leader"].includes(membership.role)) {
      return c.json({ error: { message: "Only team owners can create events", code: "FORBIDDEN" } }, 403);
    }

    const reminderMins = body.reminderMinutes ?? [];

    const event = await prisma.calendarEvent.create({
      data: {
        title: body.title,
        description: body.description,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        allDay: body.allDay ?? true,
        color: body.color ?? "#4361EE",
        isHidden: body.isHidden ?? false,
        isVideoMeeting: body.isVideoMeeting ?? false,
        reminderMinutes: JSON.stringify(reminderMins),
        teamId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

    if (body.isVideoMeeting && reminderMins.length > 0) {
      await scheduleEventReminders(event.id, event.title, teamId, event.startDate, reminderMins);
    }

    await logActivity({
      teamId,
      userId: user.id,
      type: "calendar_event_added",
      metadata: { eventTitles: [event.title], eventCount: 1, isVideoMeeting: event.isVideoMeeting },
    });

    return c.json({ data: event }, 201);
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

    const updated = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        ...(body.allDay !== undefined ? { allDay: body.allDay } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.isHidden !== undefined ? { isHidden: body.isHidden } : {}),
        ...(body.isVideoMeeting !== undefined ? { isVideoMeeting: body.isVideoMeeting } : {}),
        ...(body.reminderMinutes !== undefined ? { reminderMinutes: JSON.stringify(body.reminderMinutes) } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

    // Re-schedule reminders if relevant fields changed
    const isVideo = body.isVideoMeeting !== undefined ? body.isVideoMeeting : existing.isVideoMeeting;
    if (isVideo && (body.reminderMinutes !== undefined || body.startDate !== undefined)) {
      const reminders: number[] = body.reminderMinutes ?? JSON.parse(existing.reminderMinutes || "[]");
      await scheduleEventReminders(updated.id, updated.title, teamId, updated.startDate, reminders);
    }

    return c.json({ data: updated });
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
