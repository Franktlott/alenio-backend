import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

const webRouter = new Hono();

// Helper: get session from cookie
async function getWebSession(c: any) {
  return await auth.api.getSession({ headers: c.req.raw.headers });
}

// ── API: me ──────────────────────────────────────────────────────────────────
webRouter.get("/api/me", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });
  return c.json({ data: user });
});

// ── API: teams list ───────────────────────────────────────────────────────────
webRouter.get("/api/teams", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: session.user.id },
    include: {
      team: {
        select: {
          id: true, name: true, createdAt: true,
          _count: { select: { members: true, tasks: true } },
        },
      },
    },
  });
  return c.json({ data: memberships.map((m) => ({ ...m.team, role: m.role })) });
});

// ── API: create team ──────────────────────────────────────────────────────────
webRouter.post("/api/teams", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const { name } = body;
  if (!name || !name.trim()) return c.json({ error: { message: "Name is required" } }, 400);
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      inviteCode,
      members: {
        create: { userId: session.user.id, role: "owner" },
      },
    },
    select: { id: true, name: true, createdAt: true, _count: { select: { members: true, tasks: true } } },
  });
  return c.json({ data: { ...team, role: "owner" } });
});

// ── API: get team detail ──────────────────────────────────────────────────────
webRouter.get("/api/teams/:id", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: "Not found" }, 404);
  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true, name: true, createdAt: true, inviteCode: true,
      _count: { select: { members: true, tasks: true } },
    },
  });
  const members = await prisma.teamMember.findMany({
    where: { teamId: id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });
  return c.json({ data: { ...team, members, myRole: membership.role } });
});

// ── API: edit team name ───────────────────────────────────────────────────────
webRouter.patch("/api/teams/:id", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const { name } = body;
  if (!name || !name.trim()) return c.json({ error: { message: "Name is required" } }, 400);
  const team = await prisma.team.update({
    where: { id },
    data: { name: name.trim() },
    select: { id: true, name: true },
  });
  return c.json({ data: team });
});

// ── API: remove team member ───────────────────────────────────────────────────
webRouter.delete("/api/teams/:id/members/:userId", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id, userId } = c.req.param();
  const myMembership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  await prisma.teamMember.deleteMany({ where: { teamId: id, userId } });
  return c.json({ data: { ok: true } });
});

// ── API: my tasks ─────────────────────────────────────────────────────────────
webRouter.get("/api/tasks", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const assignments = await prisma.taskAssignment.findMany({
    where: { userId: session.user.id },
    include: {
      task: {
        include: {
          team: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
    take: 100,
  });
  return c.json({ data: assignments.map((a) => a.task) });
});

// ── API: team tasks ───────────────────────────────────────────────────────────
webRouter.get("/api/teams/:id/tasks", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: "Not found" }, 404);
  const tasks = await prisma.task.findMany({
    where: { teamId: id },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, image: true } } } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ data: tasks });
});

// ── API: all team tasks (grouped) ─────────────────────────────────────────────
webRouter.get("/api/team-tasks", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: session.user.id },
    select: { teamId: true, role: true, team: { select: { id: true, name: true } } },
  });
  const teamIds = memberships.map((m) => m.teamId);
  if (!teamIds.length) return c.json({ data: [] });
  const tasks = await prisma.task.findMany({
    where: { teamId: { in: teamIds } },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, image: true } } } },
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: tasks });
});

// ── API: create task ──────────────────────────────────────────────────────────
webRouter.post("/api/tasks", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const { title, description, priority, dueDate, teamId, status } = body;
  if (!title || !title.trim()) return c.json({ error: { message: "Title is required" } }, 400);
  if (!teamId) return c.json({ error: { message: "Team is required" } }, 400);
  // Verify user is in the team
  const membership = await prisma.teamMember.findFirst({ where: { teamId, userId: session.user.id } });
  if (!membership) return c.json({ error: { message: "Not a member of this team" } }, 403);
  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description || null,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status || "todo",
      teamId,
      creatorId: session.user.id,
    },
    include: {
      team: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  await prisma.taskAssignment.create({ data: { taskId: task.id, userId: session.user.id } });
  return c.json({ data: task });
});

// ── API: update task ──────────────────────────────────────────────────────────
webRouter.patch("/api/tasks/:id", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  // Must be assigned or creator
  const [assignment, taskCheck] = await Promise.all([
    prisma.taskAssignment.findFirst({ where: { taskId: id, userId: session.user.id } }),
    prisma.task.findFirst({ where: { id, creatorId: session.user.id } }),
  ]);
  if (!assignment && !taskCheck) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const { title, description, priority, dueDate, status } = body;
  const updateData: any = {};
  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined) updateData.description = description || null;
  if (priority !== undefined) updateData.priority = priority;
  if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
  if (status !== undefined) updateData.status = status;
  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      team: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      assignments: { include: { user: { select: { id: true, name: true, image: true } } } },
    },
  });
  return c.json({ data: task });
});

// ── API: quick status update ──────────────────────────────────────────────────
webRouter.patch("/api/tasks/:id/status", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const assignment = await prisma.taskAssignment.findFirst({
    where: { taskId: id, userId: session.user.id },
  });
  if (!assignment) return c.json({ error: "Not found" }, 404);
  const { status } = await c.req.json();
  const task = await prisma.task.update({
    where: { id },
    data: { status },
    select: { id: true, title: true, status: true },
  });
  return c.json({ data: task });
});

// ── API: delete task ──────────────────────────────────────────────────────────
webRouter.delete("/api/tasks/:id", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return c.json({ error: "Not found" }, 404);
  // Must be creator or team admin/owner
  if (task.creatorId !== session.user.id) {
    const membership = task.teamId
      ? await prisma.teamMember.findFirst({ where: { teamId: task.teamId, userId: session.user.id } })
      : null;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return c.json({ error: { message: "Forbidden" } }, 403);
    }
  }
  await prisma.taskAssignment.deleteMany({ where: { taskId: id } });
  await prisma.task.delete({ where: { id } });
  return c.json({ data: { ok: true } });
});

// ── API: calendar events (all teams) ─────────────────────────────────────────
webRouter.get("/api/calendar/events", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: session.user.id },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  if (!teamIds.length) return c.json({ data: [] });
  const events = await prisma.calendarEvent.findMany({
    where: { teamId: { in: teamIds } },
    include: {
      team: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });
  return c.json({ data: events });
});

// ── API: team events ──────────────────────────────────────────────────────────
webRouter.get("/api/teams/:id/events", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: "Not found" }, 404);
  const events = await prisma.calendarEvent.findMany({
    where: { teamId: id },
    include: {
      team: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });
  return c.json({ data: events });
});

// ── API: create team event ────────────────────────────────────────────────────
webRouter.post("/api/teams/:id/events", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: { message: "Not a member of this team" } }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { title, description, startDate, endDate, allDay, color } = body;
  if (!title || !title.trim()) return c.json({ error: { message: "Title is required" } }, 400);
  if (!startDate) return c.json({ error: { message: "Start date is required" } }, 400);
  const event = await prisma.calendarEvent.create({
    data: {
      title: title.trim(),
      description: description || null,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      allDay: allDay !== undefined ? allDay : true,
      color: color || "#4361EE",
      teamId: id,
      createdById: session.user.id,
    },
    include: {
      team: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  return c.json({ data: event });
});

// ── API: update team event ────────────────────────────────────────────────────
webRouter.patch("/api/teams/:id/events/:eid", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id, eid } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: { message: "Not a member of this team" } }, 403);
  const existing = await prisma.calendarEvent.findFirst({ where: { id: eid, teamId: id } });
  if (!existing) return c.json({ error: "Not found" }, 404);
  // Creator or owner/admin can update
  if (existing.createdById !== session.user.id && !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const { title, description, startDate, endDate, allDay, color } = body;
  const updateData: any = {};
  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined) updateData.description = description || null;
  if (startDate !== undefined) updateData.startDate = new Date(startDate);
  if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
  if (allDay !== undefined) updateData.allDay = allDay;
  if (color !== undefined) updateData.color = color;
  const event = await prisma.calendarEvent.update({
    where: { id: eid },
    data: updateData,
    include: {
      team: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  return c.json({ data: event });
});

// ── API: delete team event ────────────────────────────────────────────────────
webRouter.delete("/api/teams/:id/events/:eid", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id, eid } = c.req.param();
  const membership = await prisma.teamMember.findFirst({ where: { teamId: id, userId: session.user.id } });
  if (!membership) return c.json({ error: { message: "Not a member of this team" } }, 403);
  const existing = await prisma.calendarEvent.findFirst({ where: { id: eid, teamId: id } });
  if (!existing) return c.json({ error: "Not found" }, 404);
  // Creator or owner/admin can delete
  if (existing.createdById !== session.user.id && !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  await prisma.calendarEvent.delete({ where: { id: eid } });
  return c.json({ data: { ok: true } });
});

// ── Logo asset ────────────────────────────────────────────────────────────────
webRouter.get("/logo.png", async (c) => {
  const file = Bun.file("/home/user/workspace/mobile/src/assets/alenio-icon.png");
  const exists = await file.exists();
  if (!exists) return c.text("Not found", 404);
  const buf = await file.arrayBuffer();
  return c.body(buf, 200, { "Content-Type": "image/png" });
});

webRouter.get("/logo-full.png", async (c) => {
  const file = Bun.file("/home/user/workspace/mobile/src/assets/alenio-logo-white.png");
  const exists = await file.exists();
  if (!exists) return c.text("Not found", 404);
  const buf = await file.arrayBuffer();
  return c.body(buf, 200, { "Content-Type": "image/png" });
});

// ── SPA ───────────────────────────────────────────────────────────────────────
webRouter.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alenio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, 'Segoe UI', BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      font-size: 14px;
      color: #1a1d2e;
      background: #F0F2F7;
      min-height: 100vh;
    }

    /* ── SPLIT AUTH LAYOUT ── */
    #login-screen {
      display: flex;
      min-height: 100vh;
    }
    .auth-left {
      width: 40%;
      flex-shrink: 0;
      background: linear-gradient(160deg, #0D0F1C 0%, #1A1040 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 40px;
      position: relative;
      overflow: hidden;
    }
    .auth-left::before {
      content: '';
      position: absolute;
      top: -120px; left: -120px;
      width: 400px; height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%);
      pointer-events: none;
    }
    .auth-left::after {
      content: '';
      position: absolute;
      bottom: -80px; right: -80px;
      width: 300px; height: 300px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(67,97,238,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .auth-left-inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .auth-brand-logo {
      width: 72px; height: 72px;
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 20px;
      box-shadow: 0 8px 32px rgba(67,97,238,0.35);
    }
    .auth-brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .auth-brand-wordmark {
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
      margin-bottom: 10px;
    }
    .auth-brand-tagline {
      font-size: 14px;
      color: rgba(255,255,255,0.5);
      font-weight: 400;
      line-height: 1.5;
      max-width: 220px;
    }
    .auth-dots { display: flex; gap: 6px; margin-top: 48px; }
    .auth-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: rgba(255,255,255,0.15);
    }
    .auth-dots span:first-child { background: #4361EE; }
    .auth-right {
      flex: 1;
      background: #F8F9FC;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 40px;
    }
    .auth-form-wrap { width: 100%; max-width: 380px; }
    .auth-form-wrap h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0D0F1C;
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }
    .auth-form-wrap .auth-subtitle {
      font-size: 14px;
      color: #6B7280;
      margin-bottom: 32px;
      font-weight: 400;
    }
    .field-group { margin-bottom: 20px; }
    .field-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
      letter-spacing: 0.3px;
    }
    .field {
      width: 100%;
      padding: 11px 14px;
      background: #ffffff;
      border: 1.5px solid #E5E7EB;
      border-radius: 10px;
      color: #0D0F1C;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .field:focus { border-color: #4361EE; box-shadow: 0 0 0 3px rgba(67,97,238,0.12); }
    .field::placeholder { color: #9CA3AF; }
    textarea.field { resize: vertical; min-height: 80px; }
    select.field { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
    .btn-primary {
      width: 100%;
      padding: 12px;
      background: #4361EE;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      letter-spacing: 0.2px;
    }
    .btn-primary:hover { background: #3451d1; }
    .btn-primary:active { transform: scale(0.99); }
    .btn-primary:disabled { background: #9CA3AF; cursor: not-allowed; }
    .btn-secondary {
      padding: 8px 16px;
      background: #ffffff;
      color: #374151;
      border: 1.5px solid #E5E7EB;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn-secondary:hover { background: #F9FAFB; border-color: #D1D5DB; }
    .btn-danger {
      padding: 8px 16px;
      background: #FEF2F2;
      color: #DC2626;
      border: 1.5px solid #FECACA;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-danger:hover { background: #FEE2E2; }
    .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-icon {
      padding: 6px 12px;
      background: #4361EE;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .btn-icon:hover { background: #3451d1; }
    .btn-icon:disabled { background: #9CA3AF; cursor: not-allowed; }
    .btn-ghost {
      background: transparent;
      border: none;
      color: #4361EE;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      padding: 4px 0;
      margin-top: 14px;
      display: inline-block;
      font-weight: 500;
    }
    .btn-ghost:hover { text-decoration: underline; }
    .msg {
      font-size: 13px;
      margin-top: 10px;
      padding: 10px 13px;
      border-radius: 8px;
      line-height: 1.4;
    }
    .msg.error { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
    .msg.info  { background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; }
    .msg.success { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }

    /* ── APP SHELL ── */
    #app { display: none; height: 100vh; }
    .shell { display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar {
      width: 220px;
      flex-shrink: 0;
      background: #0D0F1C;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 16px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .sidebar-logo-img { width: 28px; height: 28px; border-radius: 7px; overflow: hidden; flex-shrink: 0; }
    .sidebar-logo-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .sidebar-wordmark { font-size: 15px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px; }
    .sidebar-nav {
      flex: 1;
      padding: 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: background 0.12s, color 0.12s;
      position: relative;
      text-decoration: none;
    }
    .nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
    .nav-item.active { background: rgba(67,97,238,0.15); color: #4361EE; }
    .nav-item.active::before {
      content: '';
      position: absolute;
      left: 0; top: 6px; bottom: 6px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: #4361EE;
    }
    .nav-item svg { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.7; }
    .nav-item.active svg { opacity: 1; }
    .sidebar-footer { padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.06); }
    .user-chip {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 4px;
      background: rgba(255,255,255,0.04);
    }
    .user-avatar {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: #4361EE;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      overflow: hidden;
    }
    .user-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .user-avatar-md {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: #4361EE;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      overflow: hidden;
    }
    .user-avatar-md img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .user-email { font-size: 12px; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .signout-link {
      display: block;
      width: 100%;
      padding: 7px 10px;
      border-radius: 7px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.35);
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      transition: color 0.12s, background 0.12s;
    }
    .signout-link:hover { color: #EF4444; background: rgba(239,68,68,0.08); }

    /* Main content */
    .main-content { flex: 1; background: #F0F2F7; overflow-y: auto; display: flex; flex-direction: column; }
    .content-inner { padding: 28px 32px; max-width: 960px; width: 100%; }
    .page { display: none; }
    .page.active { display: block; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      gap: 12px;
    }
    .page-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .page-title { font-size: 20px; font-weight: 700; color: #0D0F1C; letter-spacing: -0.3px; }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      background: rgba(255,255,255,0.9);
      border: 1.5px solid #E5E7EB;
      border-radius: 7px;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.13s;
      flex-shrink: 0;
    }
    .back-btn:hover { background: #fff; }
    .back-btn svg { width: 13px; height: 13px; }

    /* Stats bar */
    .stats-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat-pill {
      background: #ffffff;
      border-radius: 8px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
      min-width: 90px;
    }
    .stat-pill .stat-label { font-size: 12px; color: #6B7280; font-weight: 500; }
    .stat-pill .stat-count { font-size: 15px; font-weight: 700; color: #0D0F1C; margin-left: auto; }

    /* Filter tabs */
    .filters { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
    .filter-btn {
      padding: 6px 14px;
      border-radius: 20px;
      border: 1.5px solid #E5E7EB;
      background: #ffffff;
      color: #6B7280;
      font-size: 12px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.13s;
    }
    .filter-btn:hover { border-color: #4361EE; color: #4361EE; }
    .filter-btn.active { background: #4361EE; border-color: #4361EE; color: #ffffff; }

    /* Task list */
    .task-card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
      overflow: hidden;
    }
    .task-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #F3F4F6;
      transition: background 0.1s;
      cursor: pointer;
    }
    .task-row:last-child { border-bottom: none; }
    .task-row:hover { background: #FAFBFF; }
    .task-check {
      width: 20px; height: 20px;
      border-radius: 50%;
      border: 2px solid #D1D5DB;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s;
      background: transparent;
    }
    .task-check:hover { border-color: #4361EE; }
    .task-check.done { background: #4361EE; border-color: #4361EE; }
    .task-check.done::after {
      content: '';
      display: block;
      width: 5px; height: 9px;
      border: 2px solid #fff;
      border-top: none;
      border-left: none;
      transform: rotate(45deg) translate(-1px, -1px);
    }
    .task-body { flex: 1; min-width: 0; }
    .task-title { font-size: 14px; font-weight: 500; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-title.done { text-decoration: line-through; color: #9CA3AF; }
    .task-badges { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-todo     { background: #EFF6FF; color: #3B82F6; }
    .badge-in_progress, .badge-in-progress { background: #F5F3FF; color: #7C3AED; }
    .badge-done     { background: #ECFDF5; color: #10B981; }
    .badge-cancelled { background: #FEF2F2; color: #EF4444; }
    .badge-team     { background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB; }
    .badge-owner    { background: #FFF7ED; color: #C2410C; border: 1px solid #FED7AA; }
    .badge-admin    { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .badge-member   { background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB; }
    .priority-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
    .priority-dot.urgent { background: #EF4444; }
    .priority-dot.high   { background: #F97316; }
    .priority-dot.medium { background: #3B82F6; }
    .priority-dot.low    { background: #94A3B8; }
    .badge-priority {
      background: transparent;
      padding: 2px 6px 2px 4px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .badge-priority.urgent { color: #EF4444; background: #FEF2F2; }
    .badge-priority.high   { color: #F97316; background: #FFF7ED; }
    .badge-priority.medium { color: #3B82F6; background: #EFF6FF; }
    .badge-priority.low    { color: #94A3B8; background: #F8FAFC; }
    .task-due { font-size: 12px; color: #9CA3AF; flex-shrink: 0; white-space: nowrap; }
    .task-assignees { display: flex; gap: -4px; flex-shrink: 0; }
    .assignee-avatar {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: #4361EE;
      border: 2px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      overflow: hidden;
      margin-left: -4px;
    }
    .assignee-avatar:first-child { margin-left: 0; }
    .assignee-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    /* Teams */
    .teams-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 800px) { .teams-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) {
      .teams-grid { grid-template-columns: 1fr; }
      .auth-left { display: none; }
      .auth-right { padding: 32px 24px; }
    }
    .team-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
      border-left: 3px solid #4361EE;
      transition: box-shadow 0.15s, transform 0.15s;
      cursor: pointer;
    }
    .team-card:hover { box-shadow: 0 4px 16px rgba(67,97,238,0.15); transform: translateY(-2px); }
    .team-card-name { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .team-card-role { margin-bottom: 12px; }
    .team-stats { display: flex; gap: 16px; }
    .team-stat { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6B7280; font-weight: 500; }
    .team-stat svg { width: 13px; height: 13px; color: #9CA3AF; }

    /* Team Detail */
    .team-detail-header {
      background: #ffffff;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .team-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .team-detail-name { font-size: 22px; font-weight: 800; color: #0D0F1C; letter-spacing: -0.3px; }
    .btn-edit-inline {
      background: transparent;
      border: none;
      color: #9CA3AF;
      cursor: pointer;
      padding: 3px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color 0.12s;
    }
    .btn-edit-inline:hover { color: #4361EE; }
    .btn-edit-inline svg { width: 14px; height: 14px; }
    .team-edit-form { display: flex; align-items: center; gap: 8px; }
    .team-edit-form input { flex: 1; padding: 7px 12px; border: 1.5px solid #4361EE; border-radius: 8px; font-size: 16px; font-weight: 700; font-family: inherit; outline: none; }
    .section-title { font-size: 13px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 12px; }
    .section-card { background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 20px; }
    .member-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #F3F4F6;
    }
    .member-row:last-child { border-bottom: none; }
    .member-info { flex: 1; min-width: 0; }
    .member-name { font-size: 14px; font-weight: 600; color: #111827; }
    .member-email { font-size: 12px; color: #9CA3AF; }

    /* Team Tasks grouped view */
    .team-group { margin-bottom: 24px; }
    .team-group-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      padding: 0 4px;
    }
    .team-group-name { font-size: 14px; font-weight: 700; color: #374151; }
    .team-group-count {
      background: #E5E7EB;
      color: #6B7280;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 10px;
    }

    /* Profile */
    .profile-card {
      background: #ffffff;
      border-radius: 14px;
      padding: 32px;
      max-width: 440px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    }
    .profile-avatar {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: #4361EE;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 18px;
      overflow: hidden;
    }
    .profile-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .profile-name { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px; letter-spacing: -0.2px; }
    .profile-email { font-size: 13px; color: #6B7280; margin-bottom: 24px; }
    .profile-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid #F3F4F6; }
    .profile-row .p-label { font-size: 13px; color: #6B7280; }
    .profile-row .p-val   { font-size: 13px; font-weight: 600; color: #111827; }

    /* Empty / loading */
    .empty { text-align: center; padding: 56px 24px; color: #9CA3AF; }
    .empty-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #F3F4F6; margin: 0 auto 14px; }
    .empty-icon svg { width: 22px; height: 22px; color: #D1D5DB; }
    .empty p { font-size: 14px; font-weight: 500; color: #6B7280; }
    .empty span { font-size: 13px; color: #9CA3AF; }
    .loading { text-align: center; padding: 48px; color: #9CA3AF; font-size: 13px; }

    /* ── MODAL ── */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-box {
      background: #ffffff;
      border-radius: 16px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      overflow: hidden;
      animation: modalIn 0.18s cubic-bezier(0.34,1.56,0.64,1);
    }
    .modal-box.modal-lg { max-width: 560px; }
    @keyframes modalIn {
      from { transform: scale(0.92); opacity: 0; }
      to   { transform: scale(1);    opacity: 1; }
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 14px;
      border-bottom: 1px solid #F3F4F6;
    }
    .modal-title { font-size: 16px; font-weight: 700; color: #0D0F1C; }
    .modal-close {
      width: 28px; height: 28px;
      border-radius: 7px;
      border: none;
      background: #F3F4F6;
      color: #6B7280;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s;
    }
    .modal-close:hover { background: #E5E7EB; color: #374151; }
    .modal-body { padding: 20px; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #F3F4F6; display: flex; gap: 8px; justify-content: flex-end; }
    .modal-msg { margin-top: 12px; }

    /* Task detail panel (right slide) */
    .detail-panel {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 420px;
      background: #ffffff;
      box-shadow: -4px 0 40px rgba(0,0,0,0.18);
      z-index: 90;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.2s ease;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }
    .panel-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.2);
      z-index: 89;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #F3F4F6;
    }
    .panel-title { font-size: 15px; font-weight: 700; color: #0D0F1C; }
    .panel-actions { display: flex; gap: 6px; }
    .panel-body { flex: 1; overflow-y: auto; padding: 20px; }
    .detail-field { margin-bottom: 18px; }
    .detail-label { font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
    .detail-value { font-size: 14px; color: #111827; line-height: 1.5; }
    .detail-value.muted { color: #9CA3AF; font-style: italic; }
    .detail-edit-row { display: flex; gap: 8px; }
    .detail-edit-row .field { flex: 1; }

    /* Calendar */
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border, #E5E7EB); border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; }
    .cal-day-header { background: #F9FAFB; padding: 8px 4px; text-align: center; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: .04em; }
    .cal-cell { background: #ffffff; min-height: 96px; padding: 6px; cursor: pointer; transition: background .15s; }
    .cal-cell:hover { background: #F9FAFB; }
    .cal-empty { background: #F9FAFB; cursor: default; }
    .cal-today { background: #EFF6FF; }
    .cal-day-num { font-size: 12px; font-weight: 500; color: #6B7280; margin-bottom: 4px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
    .cal-day-num.today { background: #4361EE; color: #fff; font-weight: 700; }
    .cal-event { font-size: 11px; font-weight: 500; color: #fff; padding: 2px 5px; border-radius: 4px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    .cal-more { font-size: 10px; color: #6B7280; padding: 1px 4px; }
  </style>
</head>
<body>

<!-- ── Login ── -->
<div id="login-screen">
  <div class="auth-left">
    <div class="auth-left-inner">
      <img src="/web/logo-full.png" alt="Alenio" style="width:160px;object-fit:contain;margin-bottom:16px;" />
      <div class="auth-brand-tagline">Team workspace, reimagined</div>
      <div class="auth-dots"><span></span><span></span><span></span></div>
    </div>
  </div>
  <div class="auth-right">
    <div class="auth-form-wrap">
      <h2>Welcome back</h2>
      <div class="auth-subtitle">Sign in to your workspace</div>
      <div class="field-group">
        <label class="field-label" for="email-input">Email address</label>
        <input class="field" type="email" id="email-input" placeholder="you@company.com"
          autocapitalize="off" autocorrect="off" autocomplete="email" />
      </div>
      <div class="field-group">
        <label class="field-label" for="password-input">Password</label>
        <input class="field" type="password" id="password-input" placeholder="Your password"
          autocomplete="current-password" />
      </div>
      <div id="login-msg"></div>
      <button type="button" class="btn-primary" id="sign-in-btn" onclick="signIn()">Sign In</button>
    </div>
  </div>
</div>

<!-- ── App ── -->
<div id="app">
  <div class="shell">

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <img src="/web/logo-full.png" alt="Alenio" style="height:22px;object-fit:contain;" />
      </div>
      <nav class="sidebar-nav">
        <button class="nav-item active" id="nav-tasks" onclick="showPage('tasks', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2.5"/>
            <path d="M5.5 8l1.5 1.5L10.5 6"/>
          </svg>
          My Tasks
        </button>
        <button class="nav-item" id="nav-team-tasks" onclick="showPage('team-tasks', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2.5"/>
            <path d="M5 6h6M5 9h4"/>
          </svg>
          Team Tasks
        </button>
        <button class="nav-item" id="nav-teams" onclick="showPage('teams', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="5.5" r="2"/>
            <circle cx="11" cy="5.5" r="1.5"/>
            <path d="M1.5 13c0-2.5 2-3.5 4.5-3.5s4.5 1 4.5 3.5"/>
            <path d="M11 9c1.5 0 3.5.8 3.5 3"/>
          </svg>
          Teams
        </button>
        <button class="nav-item" id="nav-calendar" onclick="showPage('calendar', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2"/>
            <path d="M2 6h12M5 2v2M11 2v2"/>
          </svg>
          Calendar
        </button>
        <button class="nav-item" id="nav-profile" onclick="showPage('profile', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="5.5" r="2.5"/>
            <path d="M2 14c0-3 2.5-4.5 6-4.5s6 1.5 6 4.5"/>
          </svg>
          Profile
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="user-chip">
          <div class="user-avatar" id="sidebar-avatar"></div>
          <span class="user-email" id="sidebar-email"></span>
        </div>
        <button class="signout-link" onclick="signOut()">Sign out</button>
      </div>
    </aside>

    <!-- Main -->
    <div class="main-content">
      <div class="content-inner">

        <!-- My Tasks page -->
        <div class="page active" id="page-tasks">
          <div class="page-header">
            <div class="page-title">My Tasks</div>
            <button class="btn-icon" onclick="openNewTaskModal(null)">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M8 3v10M3 8h10"/></svg>
              New Task
            </button>
          </div>
          <div class="stats-bar" id="tasks-stats"></div>
          <div class="filters">
            <button class="filter-btn active" onclick="filterTasks('all', this)">All</button>
            <button class="filter-btn" onclick="filterTasks('todo', this)">Todo</button>
            <button class="filter-btn" onclick="filterTasks('in_progress', this)">In Progress</button>
            <button class="filter-btn" onclick="filterTasks('done', this)">Done</button>
          </div>
          <div id="tasks-container"><div class="loading">Loading tasks&#8230;</div></div>
        </div>

        <!-- Team Tasks page -->
        <div class="page" id="page-team-tasks">
          <div class="page-header">
            <div class="page-title">Team Tasks</div>
          </div>
          <div class="filters">
            <button class="filter-btn active" id="tt-filter-all" onclick="filterTeamTasks('all', this)">All</button>
            <button class="filter-btn" onclick="filterTeamTasks('todo', this)">Todo</button>
            <button class="filter-btn" onclick="filterTeamTasks('in_progress', this)">In Progress</button>
            <button class="filter-btn" onclick="filterTeamTasks('done', this)">Done</button>
          </div>
          <div id="team-tasks-container"><div class="loading">Loading&#8230;</div></div>
        </div>

        <!-- Teams page (list) -->
        <div class="page" id="page-teams">
          <div class="page-header">
            <div class="page-title">My Teams</div>
            <button class="btn-icon" onclick="openNewTeamModal()">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M8 3v10M3 8h10"/></svg>
              New Team
            </button>
          </div>
          <div id="teams-list-container">
            <div id="teams-grid-wrap" class="teams-grid"><div class="loading">Loading teams&#8230;</div></div>
          </div>
        </div>

        <!-- Team Detail page (hidden until a team is clicked) -->
        <div class="page" id="page-team-detail">
          <div class="page-header">
            <div class="page-header-left">
              <button class="back-btn" onclick="backToTeams()">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2L4 7l5 5"/></svg>
                Teams
              </button>
              <div class="page-title" id="team-detail-page-title">Team</div>
            </div>
            <div id="team-detail-header-actions"></div>
          </div>
          <div id="team-detail-container"></div>
        </div>

        <!-- Profile page -->
        <div class="page" id="page-profile">
          <div class="page-header">
            <div class="page-title">Profile</div>
          </div>
          <div id="profile-container"><div class="loading">Loading&#8230;</div></div>
        </div>

        <!-- Calendar page -->
        <div class="page" id="page-calendar">
          <div class="page-header">
            <div class="page-header-left">
              <button class="btn-secondary" onclick="calPrevMonth()">&#8249;</button>
              <div class="page-title" id="cal-month-label">Month</div>
              <button class="btn-secondary" onclick="calNextMonth()">&#8250;</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <select class="field" id="cal-team-filter" onchange="renderCalendar()" style="height:32px;padding:4px 8px;font-size:13px;min-width:140px">
                <option value="all">All Teams</option>
              </select>
              <button class="btn-icon" onclick="openEventModal(null)">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M8 3v10M3 8h10"/></svg>
                New Event
              </button>
            </div>
          </div>
          <div id="calendar-container"></div>
        </div>

      </div>
    </div>
  </div>
</div>

<!-- ── MODAL: New/Edit Task ── -->
<div id="task-modal" class="modal-backdrop" style="display:none" onclick="closeTaskModal(event)">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="task-modal-title">New Task</div>
      <button class="modal-close" onclick="closeTaskModal(null)">&#10005;</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="task-modal-id" />
      <div class="field-group">
        <label class="field-label">Title <span style="color:#EF4444">*</span></label>
        <input class="field" type="text" id="task-modal-title-input" placeholder="Task title" />
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea class="field" id="task-modal-desc" placeholder="Optional description&#8230;" rows="3"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field-group">
          <label class="field-label">Priority</label>
          <select class="field" id="task-modal-priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Status</label>
          <select class="field" id="task-modal-status">
            <option value="todo" selected>Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field-group">
          <label class="field-label">Due Date</label>
          <input class="field" type="date" id="task-modal-due" />
        </div>
        <div class="field-group" id="task-modal-team-wrap">
          <label class="field-label">Team <span style="color:#EF4444">*</span></label>
          <select class="field" id="task-modal-team">
            <option value="">Select team&#8230;</option>
          </select>
        </div>
      </div>
      <div id="task-modal-msg" class="modal-msg"></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeTaskModal(null)">Cancel</button>
      <button class="btn-icon" id="task-modal-save-btn" onclick="saveTask()">Save Task</button>
    </div>
  </div>
</div>

<!-- ── MODAL: New Team ── -->
<div id="new-team-modal" class="modal-backdrop" style="display:none" onclick="closeNewTeamModal(event)">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">New Team</div>
      <button class="modal-close" onclick="closeNewTeamModal(null)">&#10005;</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label class="field-label">Team Name <span style="color:#EF4444">*</span></label>
        <input class="field" type="text" id="new-team-name" placeholder="e.g. Engineering, Design&#8230;" />
      </div>
      <div id="new-team-msg" class="modal-msg"></div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeNewTeamModal(null)">Cancel</button>
      <button class="btn-icon" id="new-team-save-btn" onclick="saveNewTeam()">Create Team</button>
    </div>
  </div>
</div>

<!-- ── MODAL: Calendar Event ── -->
<div id="event-modal" class="modal-backdrop" style="display:none" onclick="closeEventModal(event)">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="event-modal-title">New Event</div>
      <button class="modal-close" onclick="closeEventModal(null)">&#10005;</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="event-modal-id" />
      <input type="hidden" id="event-modal-team-id" />
      <div class="field-group">
        <label class="field-label">Title <span style="color:#EF4444">*</span></label>
        <input class="field" type="text" id="event-modal-title-input" placeholder="Event title" />
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea class="field" id="event-modal-desc" placeholder="Optional description..." rows="2"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field-group">
          <label class="field-label">Start Date</label>
          <input class="field" type="date" id="event-modal-start" />
        </div>
        <div class="field-group">
          <label class="field-label">End Date</label>
          <input class="field" type="date" id="event-modal-end" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field-group">
          <label class="field-label">Color</label>
          <select class="field" id="event-modal-color">
            <option value="#6366F1">Indigo</option>
            <option value="#3B82F6">Blue</option>
            <option value="#10B981">Green</option>
            <option value="#F59E0B">Amber</option>
            <option value="#EF4444">Red</option>
            <option value="#8B5CF6">Purple</option>
          </select>
        </div>
        <div class="field-group" id="event-modal-team-wrap">
          <label class="field-label">Team <span style="color:#EF4444">*</span></label>
          <select class="field" id="event-modal-team-select">
            <option value="">Select team...</option>
          </select>
        </div>
      </div>
      <div id="event-modal-msg" class="modal-msg"></div>
    </div>
    <div class="modal-footer">
      <button class="btn-danger" id="event-modal-delete-btn" onclick="deleteEvent()" style="display:none">Delete</button>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="btn-secondary" onclick="closeEventModal(null)">Cancel</button>
        <button class="btn-icon" id="event-modal-save-btn" onclick="saveEvent()">Save Event</button>
      </div>
    </div>
  </div>
</div>

<!-- ── PANEL: Task Detail ── -->
<div id="task-panel-overlay" class="panel-overlay" style="display:none" onclick="closeTaskPanel()"></div>
<div id="task-detail-panel" class="detail-panel" style="display:none">
  <div class="panel-header">
    <div class="panel-title">Task Detail</div>
    <div class="panel-actions">
      <button class="btn-secondary" id="panel-edit-btn" onclick="enterPanelEditMode()" style="font-size:12px;padding:5px 10px">Edit</button>
      <button class="btn-danger" id="panel-delete-btn" onclick="deleteTaskFromPanel()" style="font-size:12px;padding:5px 10px">Delete</button>
      <button class="modal-close" onclick="closeTaskPanel()">&#10005;</button>
    </div>
  </div>
  <div class="panel-body" id="task-panel-body"></div>
</div>

<script>
  // ── State ──────────────────────────────────────────────────────────────────
  var allTasks = [];
  var allTeamTasks = [];
  var allTeams = [];
  var currentFilter = 'all';
  var currentTeamTaskFilter = 'all';
  var currentUser = null;
  var currentTeamId = null;
  var panelTask = null;
  var panelEditMode = false;
  var calYear = new Date().getFullYear();
  var calMonth = new Date().getMonth(); // 0-indexed
  var allCalEvents = [];
  var calEventModalData = null; // currently editing event

  // ── Helpers ────────────────────────────────────────────────────────────────
  function show(id) { document.getElementById(id).style.display = 'flex'; }
  function hide(id) { document.getElementById(id).style.display = 'none'; }
  function qs(sel) { return document.querySelector(sel); }

  function setMsg(id, msg, type) {
    var el = document.getElementById(id);
    el.className = 'msg ' + type;
    el.textContent = msg;
  }
  function clearMsg(id) {
    var el = document.getElementById(id);
    el.className = '';
    el.textContent = '';
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function fmt(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function toInputDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(s) {
    var labels = { todo: 'Todo', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled' };
    return '<span class="badge badge-' + s + '">' + (labels[s] || s) + '</span>';
  }

  function priorityBadge(p) {
    if (!p) return '';
    var cap = p.charAt(0).toUpperCase() + p.slice(1);
    return '<span class="badge-priority ' + p + '"><span class="priority-dot ' + p + '"></span>' + cap + '</span>';
  }

  function roleBadge(role) {
    return '<span class="badge badge-' + role + '">' + role.charAt(0).toUpperCase() + role.slice(1) + '</span>';
  }

  function avatarHtml(user, cls) {
    cls = cls || 'user-avatar';
    if (user && user.image) {
      return '<div class="' + cls + '"><img src="' + esc(user.image) + '" /></div>';
    }
    return '<div class="' + cls + '">' + initials(user ? user.name : '') + '</div>';
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function apiFetch(path, opts) {
    var res = await fetch('/web/api/' + path, Object.assign({ credentials: 'include' }, opts || {}));
    if (res.status === 401) { signOut(); return null; }
    if (res.status === 204) return { ok: true };
    var json = await res.json();
    if (json.error) throw new Error(json.error.message || json.error || 'Error');
    return json.data;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function signIn() {
    var email = document.getElementById('email-input').value.trim();
    var password = document.getElementById('password-input').value;
    if (!email || !password) return;
    var btn = document.getElementById('sign-in-btn');
    btn.disabled = true; btn.textContent = 'Signing in\u2026';
    clearMsg('login-msg');
    try {
      var res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
        credentials: 'include',
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error(d.message || 'Invalid email or password');
      hide('login-screen');
      await initApp();
    } catch (e) {
      setMsg('login-msg', (e && e.message) ? e.message : 'Something went wrong.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  }

  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    document.getElementById('app').style.display = 'none';
    document.getElementById('email-input').value = '';
    document.getElementById('password-input').value = '';
    show('login-screen');
  }

  document.getElementById('email-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('password-input').focus(); });
  document.getElementById('password-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') signIn(); });

  // ── App Init ───────────────────────────────────────────────────────────────
  async function initApp() {
    var me = await apiFetch('me');
    if (!me) return;
    currentUser = me;

    var av = document.getElementById('sidebar-avatar');
    if (me.image) { av.innerHTML = '<img src="' + esc(me.image) + '" />'; }
    else { av.textContent = initials(me.name); }
    document.getElementById('sidebar-email').textContent = me.email || '';
    document.getElementById('app').style.display = 'block';

    loadTasks();
    loadTeams();
    loadTeamTasks();
    loadProfile(me);
    loadCalendarEvents();
  }

  // ── My Tasks ───────────────────────────────────────────────────────────────
  async function loadTasks() {
    var tasks = await apiFetch('tasks');
    allTasks = tasks || [];
    renderStatsBar();
    renderTasks();
  }

  function renderStatsBar() {
    var total = allTasks.length;
    var todo = allTasks.filter(function(t) { return t.status === 'todo'; }).length;
    var inprog = allTasks.filter(function(t) { return t.status === 'in_progress'; }).length;
    var done = allTasks.filter(function(t) { return t.status === 'done'; }).length;
    document.getElementById('tasks-stats').innerHTML =
      '<div class="stat-pill"><span class="stat-label">Total</span><span class="stat-count">' + total + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">Todo</span><span class="stat-count">' + todo + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">In Progress</span><span class="stat-count">' + inprog + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">Done</span><span class="stat-count">' + done + '</span></div>';
  }

  function renderTasks() {
    var filtered = currentFilter === 'all' ? allTasks : allTasks.filter(function(t) { return t.status === currentFilter; });
    var container = document.getElementById('tasks-container');
    if (!filtered.length) {
      var label = currentFilter === 'all' ? 'No tasks assigned to you yet.' : 'No ' + currentFilter.replace('_', ' ') + ' tasks.';
      container.innerHTML = '<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 12l2 2 4-4"/></svg></div><p>' + label + '</p><span>Click "New Task" to create one.</span></div>';
      return;
    }
    container.innerHTML = '<div class="task-card">' + filtered.map(renderTaskRow).join('') + '</div>';
  }

  function renderTaskRow(t) {
    var done = t.status === 'done';
    return '<div class="task-row" onclick="openTaskPanel(\\'' + t.id + '\\')">' +
      '<div class="task-check ' + (done ? 'done' : '') + '" data-id="' + t.id + '" data-status="' + t.status + '" onclick="toggleTask(event, this.dataset.id, this.dataset.status)"></div>' +
      '<div class="task-body">' +
        '<div class="task-title' + (done ? ' done' : '') + '">' + esc(t.title) + '</div>' +
        '<div class="task-badges">' +
          statusBadge(t.status) +
          (t.priority ? priorityBadge(t.priority) : '') +
          (t.team ? '<span class="badge badge-team">' + esc(t.team.name) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (t.dueDate ? '<span class="task-due">Due ' + fmtDate(t.dueDate) + '</span>' : '') +
    '</div>';
  }

  function filterTasks(f, btn) {
    currentFilter = f;
    document.querySelectorAll('#page-tasks .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTasks();
  }

  async function toggleTask(event, id, currentStatus) {
    event.stopPropagation();
    var newStatus = currentStatus === 'done' ? 'todo' : 'done';
    try {
      await apiFetch('tasks/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      allTasks = allTasks.map(function(t) { return t.id === id ? Object.assign({}, t, { status: newStatus }) : t; });
      renderStatsBar();
      renderTasks();
    } catch(e) {}
  }

  // ── Team Tasks ─────────────────────────────────────────────────────────────
  async function loadTeamTasks() {
    try {
      var tasks = await apiFetch('team-tasks');
      allTeamTasks = tasks || [];
      renderTeamTasks();
    } catch(e) {
      document.getElementById('team-tasks-container').innerHTML = '<div class="empty"><p>Could not load team tasks.</p></div>';
    }
  }

  function filterTeamTasks(f, btn) {
    currentTeamTaskFilter = f;
    document.querySelectorAll('#page-team-tasks .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTeamTasks();
  }

  function renderTeamTasks() {
    var container = document.getElementById('team-tasks-container');
    var filtered = currentTeamTaskFilter === 'all' ? allTeamTasks : allTeamTasks.filter(function(t) { return t.status === currentTeamTaskFilter; });
    if (!filtered.length) {
      container.innerHTML = '<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 12l2 2 4-4"/></svg></div><p>No team tasks found.</p></div>';
      return;
    }
    // Group by team
    var byTeam = {};
    var teamOrder = [];
    filtered.forEach(function(t) {
      var tid = t.team ? t.team.id : 'unknown';
      var tname = t.team ? t.team.name : 'Unknown Team';
      if (!byTeam[tid]) { byTeam[tid] = { name: tname, tasks: [] }; teamOrder.push(tid); }
      byTeam[tid].tasks.push(t);
    });
    container.innerHTML = teamOrder.map(function(tid) {
      var group = byTeam[tid];
      return '<div class="team-group">' +
        '<div class="team-group-header"><span class="team-group-name">' + esc(group.name) + '</span><span class="team-group-count">' + group.tasks.length + '</span></div>' +
        '<div class="task-card">' + group.tasks.map(renderTeamTaskRow).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  function renderTeamTaskRow(t) {
    var done = t.status === 'done';
    var assignees = (t.assignments || []).slice(0, 3);
    return '<div class="task-row" style="cursor:default">' +
      '<div class="task-check ' + (done ? 'done' : '') + '"></div>' +
      '<div class="task-body">' +
        '<div class="task-title' + (done ? ' done' : '') + '">' + esc(t.title) + '</div>' +
        '<div class="task-badges">' +
          statusBadge(t.status) +
          (t.priority ? priorityBadge(t.priority) : '') +
          (t.createdBy ? '<span class="badge badge-team">by ' + esc(t.createdBy.name) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (assignees.length ? '<div class="task-assignees">' + assignees.map(function(a) {
        return avatarHtml(a.user, 'assignee-avatar');
      }).join('') + '</div>' : '') +
      (t.dueDate ? '<span class="task-due">Due ' + fmtDate(t.dueDate) + '</span>' : '') +
    '</div>';
  }

  // ── Teams list ─────────────────────────────────────────────────────────────
  async function loadTeams() {
    try {
      var teams = await apiFetch('teams');
      allTeams = teams || [];
      renderTeamsList();
    } catch(e) {
      document.getElementById('teams-grid-wrap').innerHTML = '<div class="empty"><p>Could not load teams.</p></div>';
    }
  }

  function renderTeamsList() {
    var container = document.getElementById('teams-grid-wrap');
    if (!allTeams.length) {
      container.innerHTML = '<div class="empty"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg></div><p>You are not in any team yet.</p><span>Create a team to get started.</span></div>';
      return;
    }
    container.innerHTML = allTeams.map(function(t) {
      return '<div class="team-card" onclick="openTeamDetail(\\'' + t.id + '\\')">' +
        '<div class="team-card-name">' + esc(t.name) + '</div>' +
        '<div class="team-card-role">' + roleBadge(t.role || 'member') + '</div>' +
        '<div class="team-stats">' +
          '<div class="team-stat"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="5" r="2"/><path d="M1.5 13c0-2.5 2-3 4.5-3s4.5.5 4.5 3"/><circle cx="12" cy="5" r="1.5"/><path d="M11 10c1 0 3 .5 3 2.5"/></svg>' + t._count.members + ' members</div>' +
          '<div class="team-stat"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8l2 2 4-4"/></svg>' + t._count.tasks + ' tasks</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── New Team Modal ─────────────────────────────────────────────────────────
  function openNewTeamModal() {
    document.getElementById('new-team-name').value = '';
    clearMsg('new-team-msg');
    document.getElementById('new-team-modal').style.display = 'flex';
    setTimeout(function() { document.getElementById('new-team-name').focus(); }, 50);
  }

  function closeNewTeamModal(event) {
    if (event && event.target !== document.getElementById('new-team-modal')) return;
    document.getElementById('new-team-modal').style.display = 'none';
  }

  document.getElementById('new-team-name').addEventListener('keydown', function(e) { if (e.key === 'Enter') saveNewTeam(); if (e.key === 'Escape') closeNewTeamModal(null); });

  async function saveNewTeam() {
    var name = document.getElementById('new-team-name').value.trim();
    if (!name) { setMsg('new-team-msg', 'Team name is required.', 'error'); return; }
    var btn = document.getElementById('new-team-save-btn');
    btn.disabled = true; btn.textContent = 'Creating\u2026';
    clearMsg('new-team-msg');
    try {
      var team = await apiFetch('teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      });
      allTeams.push(team);
      renderTeamsList();
      document.getElementById('new-team-modal').style.display = 'none';
      // Refresh team dropdowns
      populateTeamDropdown();
    } catch(e) {
      setMsg('new-team-msg', e.message || 'Failed to create team.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Team';
    }
  }

  // ── Team Detail ────────────────────────────────────────────────────────────
  async function openTeamDetail(teamId) {
    currentTeamId = teamId;
    // Switch to team detail page
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-team-detail').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('nav-teams').classList.add('active');
    document.getElementById('team-detail-container').innerHTML = '<div class="loading">Loading team&#8230;</div>';
    document.getElementById('team-detail-header-actions').innerHTML = '';

    try {
      var [teamData, teamTasks] = await Promise.all([
        apiFetch('teams/' + teamId),
        apiFetch('teams/' + teamId + '/tasks'),
      ]);
      renderTeamDetail(teamData, teamTasks || []);
    } catch(e) {
      document.getElementById('team-detail-container').innerHTML = '<div class="empty"><p>Could not load team.</p></div>';
    }
  }

  function renderTeamDetail(team, tasks) {
    document.getElementById('team-detail-page-title').textContent = team.name;
    var canEdit = team.myRole === 'owner' || team.myRole === 'admin';
    var members = team.members || [];

    // Header actions
    document.getElementById('team-detail-header-actions').innerHTML =
      '<button class="btn-icon" onclick="openNewTaskModal(\\'' + team.id + '\\')">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><path d="M8 3v10M3 8h10"/></svg> New Task' +
      '</button>';

    // Name section with inline edit
    var nameHtml = '<div class="team-detail-header">' +
      '<div class="team-name-row" id="team-name-view">' +
        '<div class="team-detail-name">' + esc(team.name) + '</div>' +
        (canEdit ? '<button class="btn-edit-inline" onclick="startTeamNameEdit(\\'' + team.id + '\\', this)" title="Edit name"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 2l3 3-8 8H3v-3L11 2z"/></svg></button>' : '') +
      '</div>' +
      '<div style="display:none" id="team-name-edit">' +
        '<div class="team-edit-form">' +
          '<input class="field" type="text" id="team-name-edit-input" value="' + esc(team.name) + '" />' +
          '<button class="btn-icon" onclick="saveTeamName(\\'' + team.id + '\\')" style="padding:7px 12px">Save</button>' +
          '<button class="btn-secondary" onclick="cancelTeamNameEdit()" style="padding:7px 12px">Cancel</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#9CA3AF;margin-top:6px">' +
        '<span>' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</span>' +
        '<span style="margin:0 8px">&#183;</span>' +
        '<span>' + tasks.length + ' task' + (tasks.length !== 1 ? 's' : '') + '</span>' +
        (canEdit ? '<span style="margin:0 8px">&#183;</span><span style="color:#4361EE;font-weight:600">Invite code: ' + esc(team.inviteCode) + '</span>' : '') +
      '</div>' +
    '</div>';

    // Members section
    var membersHtml = '<div class="section-title">Members</div>' +
      '<div class="section-card">' +
      members.map(function(m) {
        var isMe = currentUser && m.user.id === currentUser.id;
        var canRemove = canEdit && !isMe && !(m.role === 'owner');
        return '<div class="member-row">' +
          avatarHtml(m.user, 'user-avatar-md') +
          '<div class="member-info">' +
            '<div class="member-name">' + esc(m.user.name || 'Unknown') + (isMe ? ' <span style="font-size:11px;color:#9CA3AF">(you)</span>' : '') + '</div>' +
            '<div class="member-email">' + esc(m.user.email) + '</div>' +
          '</div>' +
          roleBadge(m.role) +
          (canRemove ? '<button class="btn-danger" style="font-size:11px;padding:4px 8px;margin-left:8px" onclick="removeMember(\\'' + team.id + '\\', \\'' + m.user.id + '\\', this)">Remove</button>' : '') +
        '</div>';
      }).join('') +
      '</div>';

    // Tasks section
    var tasksHtml = '<div class="section-title">Team Tasks</div>';
    if (!tasks.length) {
      tasksHtml += '<div class="empty" style="padding:28px"><p>No tasks yet.</p><span>Click "New Task" to create the first one.</span></div>';
    } else {
      tasksHtml += '<div class="task-card">' +
        tasks.map(function(t) {
          var done = t.status === 'done';
          var assignees = (t.assignments || []).slice(0, 3);
          return '<div class="task-row" style="cursor:default">' +
            '<div class="task-check ' + (done ? 'done' : '') + '"></div>' +
            '<div class="task-body">' +
              '<div class="task-title' + (done ? ' done' : '') + '">' + esc(t.title) + '</div>' +
              '<div class="task-badges">' +
                statusBadge(t.status) +
                (t.priority ? priorityBadge(t.priority) : '') +
                (t.createdBy ? '<span class="badge badge-team">by ' + esc(t.createdBy.name) + '</span>' : '') +
              '</div>' +
            '</div>' +
            (assignees.length ? '<div class="task-assignees">' + assignees.map(function(a) { return avatarHtml(a.user, 'assignee-avatar'); }).join('') + '</div>' : '') +
            (t.dueDate ? '<span class="task-due">Due ' + fmtDate(t.dueDate) + '</span>' : '') +
          '</div>';
        }).join('') +
        '</div>';
    }

    document.getElementById('team-detail-container').innerHTML = nameHtml + membersHtml + tasksHtml;
  }

  function backToTeams() {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-teams').classList.add('active');
    currentTeamId = null;
  }

  function startTeamNameEdit(teamId, btn) {
    document.getElementById('team-name-view').style.display = 'none';
    document.getElementById('team-name-edit').style.display = 'block';
    document.getElementById('team-name-edit-input').focus();
    document.getElementById('team-name-edit-input').select();
  }

  function cancelTeamNameEdit() {
    document.getElementById('team-name-view').style.display = 'flex';
    document.getElementById('team-name-edit').style.display = 'none';
  }

  async function saveTeamName(teamId) {
    var name = document.getElementById('team-name-edit-input').value.trim();
    if (!name) return;
    try {
      var updated = await apiFetch('teams/' + teamId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      });
      // Update local state
      allTeams = allTeams.map(function(t) { return t.id === teamId ? Object.assign({}, t, { name: updated.name }) : t; });
      // Update page title
      document.getElementById('team-detail-page-title').textContent = updated.name;
      // Reload team detail
      openTeamDetail(teamId);
    } catch(e) {
      alert('Failed to update team name: ' + e.message);
    }
  }

  async function removeMember(teamId, userId, btn) {
    if (!confirm('Remove this member from the team?')) return;
    btn.disabled = true; btn.textContent = 'Removing\u2026';
    try {
      await apiFetch('teams/' + teamId + '/members/' + userId, { method: 'DELETE' });
      openTeamDetail(teamId);
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Remove';
      alert('Failed: ' + e.message);
    }
  }

  // ── New Task Modal ─────────────────────────────────────────────────────────
  function populateTeamDropdown(selectedTeamId) {
    var sel = document.getElementById('task-modal-team');
    var current = sel.value;
    sel.innerHTML = '<option value="">Select team&#8230;</option>' +
      allTeams.map(function(t) {
        var sel2 = (selectedTeamId === t.id || (!selectedTeamId && current === t.id)) ? ' selected' : '';
        return '<option value="' + t.id + '"' + sel2 + '>' + esc(t.name) + '</option>';
      }).join('');
    if (selectedTeamId) sel.value = selectedTeamId;
  }

  function openNewTaskModal(preselectedTeamId) {
    document.getElementById('task-modal-id').value = '';
    document.getElementById('task-modal-title-input').value = '';
    document.getElementById('task-modal-desc').value = '';
    document.getElementById('task-modal-priority').value = 'medium';
    document.getElementById('task-modal-status').value = 'todo';
    document.getElementById('task-modal-due').value = '';
    document.getElementById('task-modal-title').textContent = 'New Task';
    document.getElementById('task-modal-save-btn').textContent = 'Save Task';
    clearMsg('task-modal-msg');
    populateTeamDropdown(preselectedTeamId || currentTeamId || null);
    // If preselected, hide team dropdown (or just leave it)
    document.getElementById('task-modal').style.display = 'flex';
    setTimeout(function() { document.getElementById('task-modal-title-input').focus(); }, 50);
  }

  function openEditTaskModal(task) {
    document.getElementById('task-modal-id').value = task.id;
    document.getElementById('task-modal-title-input').value = task.title || '';
    document.getElementById('task-modal-desc').value = task.description || '';
    document.getElementById('task-modal-priority').value = task.priority || 'medium';
    document.getElementById('task-modal-status').value = task.status || 'todo';
    document.getElementById('task-modal-due').value = task.dueDate ? toInputDate(task.dueDate) : '';
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    document.getElementById('task-modal-save-btn').textContent = 'Update Task';
    clearMsg('task-modal-msg');
    populateTeamDropdown(task.teamId || (task.team && task.team.id) || null);
    // Hide team field when editing (team can't change)
    document.getElementById('task-modal-team-wrap').style.display = 'none';
    document.getElementById('task-modal').style.display = 'flex';
    setTimeout(function() { document.getElementById('task-modal-title-input').focus(); }, 50);
  }

  function closeTaskModal(event) {
    if (event && event.target !== document.getElementById('task-modal')) return;
    document.getElementById('task-modal').style.display = 'none';
    document.getElementById('task-modal-team-wrap').style.display = 'block';
  }

  async function saveTask() {
    var id = document.getElementById('task-modal-id').value;
    var title = document.getElementById('task-modal-title-input').value.trim();
    var description = document.getElementById('task-modal-desc').value.trim();
    var priority = document.getElementById('task-modal-priority').value;
    var status = document.getElementById('task-modal-status').value;
    var dueDate = document.getElementById('task-modal-due').value;
    var teamId = document.getElementById('task-modal-team').value;

    if (!title) { setMsg('task-modal-msg', 'Title is required.', 'error'); return; }
    if (!id && !teamId) { setMsg('task-modal-msg', 'Please select a team.', 'error'); return; }

    var btn = document.getElementById('task-modal-save-btn');
    btn.disabled = true; btn.textContent = id ? 'Updating\u2026' : 'Creating\u2026';
    clearMsg('task-modal-msg');

    try {
      var payload = { title: title, description: description || null, priority: priority, status: status, dueDate: dueDate || null };
      var task;
      if (id) {
        task = await apiFetch('tasks/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        payload.teamId = teamId;
        task = await apiFetch('tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      document.getElementById('task-modal').style.display = 'none';
      document.getElementById('task-modal-team-wrap').style.display = 'block';
      // Refresh relevant lists
      if (id) {
        allTasks = allTasks.map(function(t) { return t.id === id ? Object.assign({}, t, task) : t; });
        renderStatsBar(); renderTasks();
      } else {
        allTasks.unshift(task);
        renderStatsBar(); renderTasks();
      }
      // Also refresh team tasks view
      loadTeamTasks();
      // If we're on team detail, refresh
      if (currentTeamId) { openTeamDetail(currentTeamId); }
      // Refresh team counts
      loadTeams();
    } catch(e) {
      setMsg('task-modal-msg', e.message || 'Failed to save task.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = id ? 'Update Task' : 'Save Task';
    }
  }

  // ── Task Detail Panel ──────────────────────────────────────────────────────
  function openTaskPanel(taskId) {
    var task = allTasks.find(function(t) { return t.id === taskId; });
    if (!task) return;
    panelTask = task;
    panelEditMode = false;
    renderTaskPanel(task, false);
    document.getElementById('task-panel-overlay').style.display = 'block';
    document.getElementById('task-detail-panel').style.display = 'flex';
  }

  function closeTaskPanel() {
    document.getElementById('task-panel-overlay').style.display = 'none';
    document.getElementById('task-detail-panel').style.display = 'none';
    panelTask = null;
    panelEditMode = false;
  }

  function renderTaskPanel(task, editMode) {
    var body = document.getElementById('task-panel-body');
    if (!editMode) {
      body.innerHTML =
        '<div class="detail-field">' +
          '<div class="detail-label">Title</div>' +
          '<div class="detail-value" style="font-size:16px;font-weight:700">' + esc(task.title) + '</div>' +
        '</div>' +
        '<div class="detail-field">' +
          '<div class="detail-label">Description</div>' +
          '<div class="detail-value' + (!task.description ? ' muted' : '') + '">' + (task.description ? esc(task.description).replace(/\\n/g, '<br>') : 'No description') + '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
          '<div class="detail-field"><div class="detail-label">Status</div><div class="detail-value">' + statusBadge(task.status) + '</div></div>' +
          '<div class="detail-field"><div class="detail-label">Priority</div><div class="detail-value">' + (task.priority ? priorityBadge(task.priority) : '<span class="detail-value muted">None</span>') + '</div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
          '<div class="detail-field"><div class="detail-label">Due Date</div><div class="detail-value' + (!task.dueDate ? ' muted' : '') + '">' + (task.dueDate ? fmt(task.dueDate) : 'No due date') + '</div></div>' +
          '<div class="detail-field"><div class="detail-label">Team</div><div class="detail-value">' + (task.team ? esc(task.team.name) : '<span class="detail-value muted">No team</span>') + '</div></div>' +
        '</div>' +
        '<div class="detail-field"><div class="detail-label">Created</div><div class="detail-value">' + fmt(task.createdAt) + '</div></div>';
    } else {
      body.innerHTML =
        '<div class="detail-field">' +
          '<div class="detail-label">Title <span style="color:#EF4444">*</span></div>' +
          '<input class="field" type="text" id="panel-title" value="' + esc(task.title) + '" />' +
        '</div>' +
        '<div class="detail-field">' +
          '<div class="detail-label">Description</div>' +
          '<textarea class="field" id="panel-desc" rows="3">' + esc(task.description || '') + '</textarea>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<div class="detail-field"><div class="detail-label">Status</div><select class="field" id="panel-status"><option value="todo"' + (task.status==='todo'?' selected':'') + '>Todo</option><option value="in_progress"' + (task.status==='in_progress'?' selected':'') + '>In Progress</option><option value="done"' + (task.status==='done'?' selected':'') + '>Done</option><option value="cancelled"' + (task.status==='cancelled'?' selected':'') + '>Cancelled</option></select></div>' +
          '<div class="detail-field"><div class="detail-label">Priority</div><select class="field" id="panel-priority"><option value="low"' + (task.priority==='low'?' selected':'') + '>Low</option><option value="medium"' + (task.priority==='medium'?' selected':'') + '>Medium</option><option value="high"' + (task.priority==='high'?' selected':'') + '>High</option><option value="urgent"' + (task.priority==='urgent'?' selected':'') + '>Urgent</option></select></div>' +
        '</div>' +
        '<div class="detail-field"><div class="detail-label">Due Date</div><input class="field" type="date" id="panel-due" value="' + (task.dueDate ? toInputDate(task.dueDate) : '') + '" /></div>' +
        '<div id="panel-edit-msg" style="margin-top:4px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<button class="btn-icon" id="panel-save-btn" onclick="savePanelEdit()">Save Changes</button>' +
          '<button class="btn-secondary" onclick="cancelPanelEdit()">Cancel</button>' +
        '</div>';
    }
    document.getElementById('panel-edit-btn').style.display = editMode ? 'none' : '';
  }

  function enterPanelEditMode() {
    panelEditMode = true;
    renderTaskPanel(panelTask, true);
  }

  function cancelPanelEdit() {
    panelEditMode = false;
    renderTaskPanel(panelTask, false);
  }

  async function savePanelEdit() {
    var title = document.getElementById('panel-title').value.trim();
    if (!title) { setMsg('panel-edit-msg', 'Title is required.', 'error'); return; }
    var btn = document.getElementById('panel-save-btn');
    btn.disabled = true; btn.textContent = 'Saving\u2026';

    try {
      var updated = await apiFetch('tasks/' + panelTask.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          description: document.getElementById('panel-desc').value.trim() || null,
          status: document.getElementById('panel-status').value,
          priority: document.getElementById('panel-priority').value,
          dueDate: document.getElementById('panel-due').value || null,
        }),
      });
      panelTask = Object.assign({}, panelTask, updated);
      allTasks = allTasks.map(function(t) { return t.id === panelTask.id ? panelTask : t; });
      renderStatsBar(); renderTasks();
      panelEditMode = false;
      renderTaskPanel(panelTask, false);
      loadTeamTasks();
    } catch(e) {
      setMsg('panel-edit-msg', e.message || 'Failed to save.', 'error');
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  }

  async function deleteTaskFromPanel() {
    if (!panelTask) return;
    if (!confirm('Delete "' + panelTask.title + '"? This cannot be undone.')) return;
    var btn = document.getElementById('panel-delete-btn');
    btn.disabled = true; btn.textContent = 'Deleting\u2026';
    try {
      await apiFetch('tasks/' + panelTask.id, { method: 'DELETE' });
      allTasks = allTasks.filter(function(t) { return t.id !== panelTask.id; });
      renderStatsBar(); renderTasks();
      closeTaskPanel();
      loadTeamTasks();
      if (currentTeamId) openTeamDetail(currentTeamId);
      loadTeams();
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Delete';
      alert('Failed to delete: ' + e.message);
    }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  function loadProfile(me) {
    document.getElementById('profile-container').innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-avatar">' + (me.image ? '<img src="' + esc(me.image) + '" />' : initials(me.name)) + '</div>' +
        '<div class="profile-name">' + esc(me.name || 'Unknown') + '</div>' +
        '<div class="profile-email">' + esc(me.email) + '</div>' +
        '<div class="profile-row"><span class="p-label">Member since</span><span class="p-val">' + fmt(me.createdAt) + '</span></div>' +
      '</div>';
  }

  // ── Calendar ───────────────────────────────────────────────────────────────
  async function loadCalendarEvents() {
    try {
      var events = await apiFetch('calendar/events');
      allCalEvents = events || [];
      populateCalTeamFilter();
      renderCalendar();
    } catch(e) {
      var cc = document.getElementById('calendar-container');
      if (cc) cc.innerHTML = '<div class="empty"><p>Could not load events.</p></div>';
    }
  }

  function populateCalTeamFilter() {
    var sel = document.getElementById('cal-team-filter');
    if (!sel) return;
    // Keep "All Teams" option, rebuild rest
    while (sel.options.length > 1) sel.remove(1);
    var seen = {};
    allCalEvents.forEach(function(ev) {
      if (ev.team && !seen[ev.team.id]) {
        seen[ev.team.id] = true;
        var opt = document.createElement('option');
        opt.value = ev.team.id;
        opt.textContent = ev.team.name;
        sel.appendChild(opt);
      }
    });
    // Also add teams from allTeams that might have no events yet
    (allTeams || []).forEach(function(t) {
      if (!seen[t.id]) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        sel.appendChild(opt);
      }
    });
  }

  function calPrevMonth() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  }

  function calNextMonth() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  }

  function renderCalendar() {
    var calContainer = document.getElementById('calendar-container');
    if (!calContainer) return;
    var teamFilterEl = document.getElementById('cal-team-filter');
    var teamFilter = teamFilterEl ? teamFilterEl.value : 'all';
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var monthLabelEl = document.getElementById('cal-month-label');
    if (monthLabelEl) monthLabelEl.textContent = monthNames[calMonth] + ' ' + calYear;

    var events = teamFilter === 'all' ? allCalEvents : allCalEvents.filter(function(ev) { return ev.teamId === teamFilter || (ev.team && ev.team.id === teamFilter); });

    // Build a map of day -> events
    var evByDay = {};
    events.forEach(function(ev) {
      var start = new Date(ev.startDate);
      var end = ev.endDate ? new Date(ev.endDate) : start;
      // Mark each day in the range
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (d <= endD) {
        if (d.getMonth() === calMonth && d.getFullYear() === calYear) {
          var key = d.getDate();
          if (!evByDay[key]) evByDay[key] = [];
          evByDay[key].push(ev);
        }
        d.setDate(d.getDate() + 1);
      }
    });

    var firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var today = new Date();
    var todayKey = (today.getFullYear() === calYear && today.getMonth() === calMonth) ? today.getDate() : -1;

    var html = '<div class="cal-grid">';
    // Header
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    dayNames.forEach(function(d) { html += '<div class="cal-day-header">' + d + '</div>'; });

    // Blank cells before first day
    for (var i = 0; i < firstDay; i++) { html += '<div class="cal-cell cal-empty"></div>'; }

    // Day cells
    for (var day = 1; day <= daysInMonth; day++) {
      var isToday = day === todayKey;
      var dayEvs = evByDay[day] || [];
      html += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '" data-day="' + day + '">';
      html += '<div class="cal-day-num' + (isToday ? ' today' : '') + '">' + day + '</div>';
      dayEvs.slice(0, 3).forEach(function(ev) {
        var color = ev.color || '#6366F1';
        html += '<div class="cal-event" style="background:' + color + '" data-id="' + esc(ev.id) + '">' + esc(ev.title) + '</div>';
      });
      if (dayEvs.length > 3) html += '<div class="cal-more">+' + (dayEvs.length - 3) + ' more</div>';
      html += '</div>';
    }

    html += '</div>';
    calContainer.innerHTML = html;

    // Attach day cell click handlers (open new event modal with default day)
    calContainer.querySelectorAll('.cal-cell:not(.cal-empty)').forEach(function(el) {
      el.addEventListener('click', function(e) {
        var day = parseInt(el.dataset.day);
        openEventModal(null, day, e);
      });
    });

    // Attach event click handlers after render
    calContainer.querySelectorAll('.cal-event').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = el.dataset.id;
        var ev = allCalEvents.find(function(x) { return x.id === id; });
        if (ev) openEventModal(ev, null, e);
      });
    });
  }

  function openEventModal(ev, defaultDay, e) {
    if (e) e.stopPropagation();
    calEventModalData = ev || null;
    document.getElementById('event-modal-title').textContent = ev ? 'Edit Event' : 'New Event';
    document.getElementById('event-modal-id').value = ev ? ev.id : '';
    document.getElementById('event-modal-team-id').value = ev ? (ev.teamId || '') : '';
    document.getElementById('event-modal-title-input').value = ev ? ev.title : '';
    document.getElementById('event-modal-desc').value = ev ? (ev.description || '') : '';
    document.getElementById('event-modal-color').value = ev ? (ev.color || '#6366F1') : '#6366F1';
    clearMsg('event-modal-msg');

    // Set dates
    if (ev) {
      document.getElementById('event-modal-start').value = toInputDate(ev.startDate);
      document.getElementById('event-modal-end').value = ev.endDate ? toInputDate(ev.endDate) : toInputDate(ev.startDate);
    } else if (defaultDay) {
      var d = new Date(calYear, calMonth, defaultDay);
      var ds = toInputDate(d.toISOString());
      document.getElementById('event-modal-start').value = ds;
      document.getElementById('event-modal-end').value = ds;
    } else {
      document.getElementById('event-modal-start').value = '';
      document.getElementById('event-modal-end').value = '';
    }

    // Populate team select
    var sel = document.getElementById('event-modal-team-select');
    sel.innerHTML = '<option value="">Select team...</option>';
    (allTeams || []).forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (ev && ev.teamId === t.id) opt.selected = true;
      sel.appendChild(opt);
    });
    if (ev) {
      document.getElementById('event-modal-team-wrap').style.display = 'none';
      document.getElementById('event-modal-delete-btn').style.display = 'block';
    } else {
      document.getElementById('event-modal-team-wrap').style.display = '';
      document.getElementById('event-modal-delete-btn').style.display = 'none';
    }

    document.getElementById('event-modal').style.display = 'flex';
    setTimeout(function() { document.getElementById('event-modal-title-input').focus(); }, 50);
  }

  function closeEventModal(e) {
    if (e && e.target !== document.getElementById('event-modal')) return;
    document.getElementById('event-modal').style.display = 'none';
    calEventModalData = null;
  }

  async function saveEvent() {
    var btn = document.getElementById('event-modal-save-btn');
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    clearMsg('event-modal-msg');
    try {
      var title = document.getElementById('event-modal-title-input').value.trim();
      var desc = document.getElementById('event-modal-desc').value.trim();
      var start = document.getElementById('event-modal-start').value;
      var end = document.getElementById('event-modal-end').value;
      var color = document.getElementById('event-modal-color').value;
      var id = document.getElementById('event-modal-id').value;
      var teamId = id ? document.getElementById('event-modal-team-id').value : document.getElementById('event-modal-team-select').value;

      if (!title) throw new Error('Title is required');
      if (!teamId) throw new Error('Team is required');
      if (!start) throw new Error('Start date is required');

      var body = { title: title, description: desc || null, startDate: start, endDate: end || start, color: color };

      if (id) {
        await apiFetch('teams/' + teamId + '/events/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await apiFetch('teams/' + teamId + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      document.getElementById('event-modal').style.display = 'none';
      calEventModalData = null;
      await loadCalendarEvents();
    } catch(e) {
      setMsg('event-modal-msg', e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Event';
    }
  }

  async function deleteEvent() {
    if (!calEventModalData) return;
    if (!confirm('Delete this event?')) return;
    var btn = document.getElementById('event-modal-delete-btn');
    btn.disabled = true;
    try {
      var teamId = calEventModalData.teamId;
      var id = calEventModalData.id;
      await apiFetch('teams/' + teamId + '/events/' + id, { method: 'DELETE' });
      document.getElementById('event-modal').style.display = 'none';
      calEventModalData = null;
      await loadCalendarEvents();
    } catch(e) {
      alert('Failed to delete: ' + e.message);
      btn.disabled = false;
    }
  }

  // ── Page navigation ────────────────────────────────────────────────────────
  function showPage(name, btn) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('page-' + name).classList.add('active');
    btn.classList.add('active');
    currentTeamId = null;
    // Refresh on navigate
    if (name === 'tasks') { loadTasks(); }
    if (name === 'team-tasks') { loadTeamTasks(); }
    if (name === 'teams') { loadTeams(); }
    if (name === 'calendar') { loadCalendarEvents(); }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (document.getElementById('event-modal').style.display === 'flex') { closeEventModal(null); return; }
      if (document.getElementById('task-modal').style.display === 'flex') { closeTaskModal(null); return; }
      if (document.getElementById('new-team-modal').style.display === 'flex') { closeNewTeamModal(null); return; }
      if (document.getElementById('task-detail-panel').style.display === 'flex') { closeTaskPanel(); return; }
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────────────
  (async function() {
    var res = await fetch('/api/auth/get-session', { credentials: 'include' });
    var data = await res.json().catch(function() { return null; });
    if (data && data.user) {
      hide('login-screen');
      await initApp();
    }
  })();
</script>
</body>
</html>`;
  return c.html(html);
});

export { webRouter };
