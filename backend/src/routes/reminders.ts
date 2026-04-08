import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const remindersRouter = new Hono<{ Variables: Variables }>();
remindersRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

const reminderInclude = {
  creator: { select: { id: true, name: true, image: true } },
} as const;

// GET /api/teams/:teamId/reminders — current user's reminders only
remindersRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const reminders = await prisma.reminder.findMany({
    where: { teamId, creatorId: user.id },
    include: reminderInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return c.json({ data: reminders });
});

// POST /api/teams/:teamId/reminders — create a reminder for self
remindersRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const body = await c.req.json();
  const { title, description, priority, dueDate, attachmentUrl } = body;

  if (!title?.trim()) {
    return c.json({ error: { message: "Title is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const reminder = await prisma.reminder.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      attachmentUrl: attachmentUrl || null,
      teamId,
      creatorId: user.id,
    },
    include: reminderInclude,
  });

  return c.json({ data: reminder }, 201);
});

// GET /api/teams/:teamId/reminders/:reminderId — get a single reminder
remindersRouter.get("/:reminderId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const reminderId = c.req.param("reminderId");

  const membership = await getMembership(user.id, teamId);
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, teamId, creatorId: user.id },
    include: reminderInclude,
  });
  if (!reminder) return c.json({ error: { message: "Reminder not found", code: "NOT_FOUND" } }, 404);

  return c.json({ data: reminder });
});

// PATCH /api/teams/:teamId/reminders/:reminderId — update status/fields
remindersRouter.patch("/:reminderId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const reminderId = c.req.param("reminderId");

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, teamId, creatorId: user.id },
  });
  if (!reminder) return c.json({ error: { message: "Reminder not found", code: "NOT_FOUND" } }, 404);

  const body = await c.req.json();
  const { status, title, description, priority, dueDate } = body;

  const updated = await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      ...(status !== undefined ? { status, completedAt: status === "done" ? new Date() : null } : {}),
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    },
    include: reminderInclude,
  });

  return c.json({ data: updated });
});

// POST /api/teams/:teamId/reminders/:reminderId/acknowledge
remindersRouter.post("/:reminderId/acknowledge", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const reminderId = c.req.param("reminderId");

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, teamId, creatorId: user.id },
  });
  if (!reminder) return c.json({ error: { message: "Reminder not found", code: "NOT_FOUND" } }, 404);

  const updated = await prisma.reminder.update({
    where: { id: reminderId },
    data: { acknowledgedAt: new Date(), status: "done", completedAt: new Date() },
    include: reminderInclude,
  });

  return c.json({ data: updated });
});

// DELETE /api/teams/:teamId/reminders/:reminderId
remindersRouter.delete("/:reminderId", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const reminderId = c.req.param("reminderId");

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, teamId, creatorId: user.id },
  });
  if (!reminder) return c.json({ error: { message: "Reminder not found", code: "NOT_FOUND" } }, 404);

  await prisma.reminder.delete({ where: { id: reminderId } });
  return c.body(null, 204);
});

export { remindersRouter };
