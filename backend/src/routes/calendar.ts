import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { logActivity } from "../lib/activity";
import { sendPushToUsers } from "../lib/push";
import { validateVideoMeetingSchedule } from "../lib/video-meeting-duration";
import {
  canApproveCalendarEvent,
  canManageCalendarEvent,
  canViewCalendarEvent,
  resolveCalendarCreate,
  resolveCalendarUpdate,
} from "../lib/calendar-permissions";

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
      const settings = parseMeetingSettings(event.reminderMinutes);
      return canViewCalendarEvent(event, user.id, membership.role, settings.assigneeIds);
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

    const createPolicy = resolveCalendarCreate(membership.role, {
      isVideoMeeting: body.isVideoMeeting,
      isHidden: body.isHidden,
    });
    if (!createPolicy.ok) {
      return c.json({ error: { message: createPolicy.message, code: "FORBIDDEN" } }, 403);
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
    const isVideoMeeting = createPolicy.isVideoMeeting;
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
        isHidden: createPolicy.isHidden,
        isVideoMeeting,
        approvalStatus: createPolicy.approvalStatus,
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

    if (createPolicy.approvalStatus === "pending") {
      const managers = await prisma.teamMember.findMany({
        where: { teamId, role: { in: ["owner", "team_leader"] } },
        select: { userId: true },
      });
      const managerIds = managers.map((m) => m.userId).filter((id) => id !== user.id);
      if (managerIds.length > 0) {
        await sendPushToUsers(
          managerIds,
          "Calendar approval needed",
          `${user.name ?? "A team member"} submitted "${event.title}" for the team calendar.`,
          { eventId: event.id, teamId, type: "calendar_event_pending" },
          "notifMeetings",
          teamId,
        );
      }
    }

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

// PATCH /api/teams/:teamId/events/:eventId — creator or owner/leader
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
    if (!membership) {
      return c.json({ error: { message: "You are not a member of this team", code: "FORBIDDEN" } }, 403);
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing || existing.teamId !== teamId) {
      return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }

    const updatePolicy = resolveCalendarUpdate(membership.role, user.id, existing, {
      isVideoMeeting: body.isVideoMeeting,
      isHidden: body.isHidden,
    });
    if (!updatePolicy.ok) {
      return c.json({ error: { message: updatePolicy.message, code: "FORBIDDEN" } }, 403);
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
    const nextIsVideoMeeting = updatePolicy.forbidVideo
      ? false
      : body.isVideoMeeting !== undefined
        ? body.isVideoMeeting
        : existing.isVideoMeeting;
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
        ...(updatePolicy.resetApproval ? { approvalStatus: updatePolicy.resetApproval } : {}),
        ...(body.isVideoMeeting !== undefined || updatePolicy.forbidVideo
          ? { isVideoMeeting: nextIsVideoMeeting }
          : {}),
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

// DELETE /api/teams/:teamId/events/:eventId — creator or owner/leader
calendarRouter.delete("/:teamId/events/:eventId", async (c) => {
  const user = c.get("user")!;
  const { teamId, eventId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "You are not a member of this team", code: "FORBIDDEN" } }, 403);
  }

  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!existing || existing.teamId !== teamId) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  if (!canManageCalendarEvent(membership.role, user.id, existing)) {
    return c.json({ error: { message: "You can only delete your own calendar entries.", code: "FORBIDDEN" } }, 403);
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

async function applyCalendarApproval(
  teamId: string,
  eventId: string,
  actorId: string,
  actorRole: string,
  status: "approved" | "rejected",
) {
  if (!canApproveCalendarEvent(actorRole)) {
    return { error: { message: "Only workspace owners and team leaders can approve calendar events.", code: "FORBIDDEN" as const }, status: 403 as const };
  }

  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!existing || existing.teamId !== teamId) {
    return { error: { message: "Event not found", code: "NOT_FOUND" as const }, status: 404 as const };
  }
  if (existing.isHidden) {
    return { error: { message: "Private events do not require approval.", code: "BAD_REQUEST" as const }, status: 400 as const };
  }
  if (existing.approvalStatus !== "pending") {
    return { error: { message: "This event is not awaiting approval.", code: "BAD_REQUEST" as const }, status: 400 as const };
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: { approvalStatus: status },
    include: {
      createdBy: { select: { id: true, name: true, image: true } },
    },
  });

  if (existing.createdById !== actorId) {
    await sendPushToUsers(
      [existing.createdById],
      status === "approved" ? "Calendar event approved" : "Calendar event declined",
      status === "approved"
        ? `"${existing.title}" was approved and is now on the team calendar.`
        : `"${existing.title}" was not approved for the team calendar.`,
      { eventId: existing.id, teamId, type: status === "approved" ? "calendar_event_approved" : "calendar_event_rejected" },
      "notifMeetings",
      teamId,
    );
  }

  const settings = parseMeetingSettings(updated.reminderMinutes);
  return { data: { ...updated, assigneeIds: settings.assigneeIds }, status: 200 as const };
}

calendarRouter.post("/:teamId/events/:eventId/approve", async (c) => {
  const user = c.get("user")!;
  const { teamId, eventId } = c.req.param();
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "You are not a member of this team", code: "FORBIDDEN" } }, 403);
  }
  const result = await applyCalendarApproval(teamId, eventId, user.id, membership.role, "approved");
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

calendarRouter.post("/:teamId/events/:eventId/reject", async (c) => {
  const user = c.get("user")!;
  const { teamId, eventId } = c.req.param();
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) {
    return c.json({ error: { message: "You are not a member of this team", code: "FORBIDDEN" } }, 403);
  }
  const result = await applyCalendarApproval(teamId, eventId, user.id, membership.role, "rejected");
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

export { calendarRouter };
