import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { logActivity } from "../lib/activity";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const calendarRouter = new Hono<{ Variables: Variables }>();

calendarRouter.use("*", authGuard);

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
        teamId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

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
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
      },
    });

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

  await prisma.calendarEvent.delete({ where: { id: eventId } });

  return c.body(null, 204);
});

export { calendarRouter };
