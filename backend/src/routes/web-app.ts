import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

const webRouter = new Hono();

// Helper: get session from cookie
async function getWebSession(c: any) {
  return await auth.api.getSession({ headers: c.req.raw.headers });
}

// User data API endpoints (session-cookie authenticated)
webRouter.get("/api/me", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });
  return c.json({ data: user });
});

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

webRouter.get("/api/tasks", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const assignments = await prisma.taskAssignment.findMany({
    where: { userId: session.user.id },
    include: {
      task: {
        select: {
          id: true, title: true, status: true, priority: true,
          dueDate: true, createdAt: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { task: { createdAt: "desc" } },
    take: 50,
  });
  return c.json({ data: assignments.map((a) => a.task) });
});

webRouter.patch("/api/tasks/:id/status", async (c) => {
  const session = await getWebSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { id } = c.req.param();
  const { status } = await c.req.json();
  // Only allow updating tasks assigned to this user
  const assignment = await prisma.taskAssignment.findFirst({
    where: { taskId: id, userId: session.user.id },
  });
  if (!assignment) return c.json({ error: "Not found" }, 404);
  const task = await prisma.task.update({
    where: { id },
    data: { status },
    select: { id: true, title: true, status: true },
  });
  return c.json({ data: task });
});

// Serve logo asset
webRouter.get("/logo.png", async (c) => {
  const file = Bun.file("/home/user/workspace/mobile/src/assets/alenio-icon.png");
  const exists = await file.exists();
  if (!exists) return c.text("Not found", 404);
  const buf = await file.arrayBuffer();
  return c.body(buf, 200, { "Content-Type": "image/png" });
});

// Serve the web portal SPA
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
    #login-screen,
    #otp-screen {
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
    .auth-dots {
      display: flex; gap: 6px; margin-top: 48px;
    }
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
    .auth-form-wrap {
      width: 100%;
      max-width: 380px;
    }
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
    .field:focus {
      border-color: #4361EE;
      box-shadow: 0 0 0 3px rgba(67,97,238,0.12);
    }
    .field::placeholder { color: #9CA3AF; }
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

    /* ── APP SHELL ── */
    #app { display: none; height: 100vh; }
    .shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

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
    .sidebar-logo-img {
      width: 28px; height: 28px;
      border-radius: 7px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .sidebar-logo-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .sidebar-wordmark {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.2px;
    }

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
    .nav-item:hover {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.8);
    }
    .nav-item.active {
      background: rgba(67,97,238,0.15);
      color: #4361EE;
    }
    .nav-item.active::before {
      content: '';
      position: absolute;
      left: 0; top: 6px; bottom: 6px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: #4361EE;
    }
    .nav-item svg {
      width: 15px; height: 15px;
      flex-shrink: 0;
      opacity: 0.7;
    }
    .nav-item.active svg { opacity: 1; }

    .sidebar-footer {
      padding: 12px 8px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
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
    .user-email {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }
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
    .signout-link:hover {
      color: #EF4444;
      background: rgba(239,68,68,0.08);
    }

    /* Main content */
    .main-content {
      flex: 1;
      background: #F0F2F7;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .content-inner {
      padding: 28px 32px;
      max-width: 900px;
      width: 100%;
    }
    .page { display: none; }
    .page.active { display: block; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .page-title {
      font-size: 20px;
      font-weight: 700;
      color: #0D0F1C;
      letter-spacing: -0.3px;
    }

    /* Stats bar */
    .stats-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
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
    .stat-pill .stat-label {
      font-size: 12px;
      color: #6B7280;
      font-weight: 500;
    }
    .stat-pill .stat-count {
      font-size: 15px;
      font-weight: 700;
      color: #0D0F1C;
      margin-left: auto;
    }

    /* Filter tabs */
    .filters {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
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
    .filter-btn.active {
      background: #4361EE;
      border-color: #4361EE;
      color: #ffffff;
    }

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
    }
    .task-row:last-child { border-bottom: none; }
    .task-row:hover { background: #FAFAFA; }

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
    .task-check.done {
      background: #4361EE;
      border-color: #4361EE;
    }
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
    .task-title {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task-title.done {
      text-decoration: line-through;
      color: #9CA3AF;
    }
    .task-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      flex-wrap: wrap;
    }

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
    .badge-cancelled{ background: #FEF2F2; color: #EF4444; }
    .badge-team     { background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB; }

    .priority-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
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

    .task-due {
      font-size: 12px;
      color: #9CA3AF;
      flex-shrink: 0;
      margin-left: auto;
      white-space: nowrap;
    }

    /* Teams grid */
    .teams-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    @media (max-width: 700px) {
      .teams-grid { grid-template-columns: repeat(2, 1fr); }
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
    }
    .team-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }
    .team-card-name {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .team-stats {
      display: flex;
      gap: 16px;
    }
    .team-stat {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #6B7280;
      font-weight: 500;
    }
    .team-stat svg { width: 13px; height: 13px; color: #9CA3AF; }

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
    .profile-name {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
      letter-spacing: -0.2px;
    }
    .profile-email {
      font-size: 13px;
      color: #6B7280;
      margin-bottom: 24px;
    }
    .profile-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-top: 1px solid #F3F4F6;
    }
    .profile-row .p-label { font-size: 13px; color: #6B7280; }
    .profile-row .p-val   { font-size: 13px; font-weight: 600; color: #111827; }

    /* Empty / loading */
    .empty {
      text-align: center;
      padding: 56px 24px;
      color: #9CA3AF;
    }
    .empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px; height: 48px;
      border-radius: 12px;
      background: #F3F4F6;
      margin: 0 auto 14px;
    }
    .empty-icon svg { width: 22px; height: 22px; color: #D1D5DB; }
    .empty p { font-size: 14px; font-weight: 500; color: #6B7280; }
    .empty span { font-size: 13px; color: #9CA3AF; }
    .loading {
      text-align: center;
      padding: 48px;
      color: #9CA3AF;
      font-size: 13px;
    }
  </style>
</head>
<body>

<!-- ── Login ── -->
<div id="login-screen">
  <div class="auth-left">
    <div class="auth-left-inner">
      <div class="auth-brand-logo">
        <img src="/web/logo.png" alt="Alenio" />
      </div>
      <div class="auth-brand-wordmark">Alenio</div>
      <div class="auth-brand-tagline">Team workspace, reimagined</div>
      <div class="auth-dots">
        <span></span><span></span><span></span>
      </div>
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
      <div id="login-msg"></div>
      <button type="button" class="btn-primary" id="send-otp-btn" onclick="sendOTP()">Continue</button>
    </div>
  </div>
</div>

<!-- ── OTP ── -->
<div id="otp-screen" style="display:none">
  <div class="auth-left">
    <div class="auth-left-inner">
      <div class="auth-brand-logo">
        <img src="/web/logo.png" alt="Alenio" />
      </div>
      <div class="auth-brand-wordmark">Alenio</div>
      <div class="auth-brand-tagline">Team workspace, reimagined</div>
      <div class="auth-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  </div>
  <div class="auth-right">
    <div class="auth-form-wrap">
      <h2>Check your inbox</h2>
      <div class="auth-subtitle" id="otp-desc">We sent a 6-digit code to your email</div>
      <div class="field-group">
        <label class="field-label" for="otp-input">One-time code</label>
        <input class="field" type="text" id="otp-input" placeholder="000000"
          maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
      </div>
      <div id="otp-msg"></div>
      <button type="button" class="btn-primary" id="verify-btn" onclick="verifyOTP()">Sign In</button>
      <br/><button class="btn-ghost" onclick="backToLogin()">&#8592; Use a different email</button>
    </div>
  </div>
</div>

<!-- ── App ── -->
<div id="app">
  <div class="shell">

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo-img">
          <img src="/web/logo.png" alt="Alenio" />
        </div>
        <span class="sidebar-wordmark">Alenio</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item active" id="nav-tasks" onclick="showPage('tasks', this)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2.5"/>
            <path d="M5.5 8l1.5 1.5L10.5 6"/>
          </svg>
          My Tasks
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

        <!-- Tasks page -->
        <div class="page active" id="page-tasks">
          <div class="page-header">
            <div class="page-title">My Tasks</div>
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

        <!-- Teams page -->
        <div class="page" id="page-teams">
          <div class="page-header">
            <div class="page-title">My Teams</div>
          </div>
          <div id="teams-container" class="teams-grid"><div class="loading">Loading teams&#8230;</div></div>
        </div>

        <!-- Profile page -->
        <div class="page" id="page-profile">
          <div class="page-header">
            <div class="page-title">Profile</div>
          </div>
          <div id="profile-container"><div class="loading">Loading&#8230;</div></div>
        </div>

      </div>
    </div>
  </div>
</div>

<script>
  var currentEmail = '';
  var allTasks = [];
  var currentFilter = 'all';

  function show(id) { document.getElementById(id).style.display = 'flex'; }
  function hide(id) { document.getElementById(id).style.display = 'none'; }

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
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // ── Auth ──

  async function sendOTP() {
    var email = document.getElementById('email-input').value.trim();
    if (!email) return;
    var btn = document.getElementById('send-otp-btn');
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    clearMsg('login-msg');
    try {
      var res = await fetch('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, type: 'sign-in' }),
        credentials: 'include',
      });
      if (!res.ok) {
        var d = await res.json().catch(function() { return {}; });
        throw new Error(d.message || 'Failed to send code');
      }
      currentEmail = email;
      hide('login-screen');
      document.getElementById('otp-desc').textContent = 'We sent a 6-digit code to ' + email;
      document.getElementById('otp-screen').style.display = 'flex';
    } catch (e) {
      var msg = (e && e.message) ? e.message : 'Something went wrong. Please try again.';
      setMsg('login-msg', msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continue';
    }
  }

  async function verifyOTP() {
    var otp = document.getElementById('otp-input').value.trim();
    if (!otp || otp.length < 6) return;
    var btn = document.getElementById('verify-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying\u2026';
    clearMsg('otp-msg');
    try {
      var res = await fetch('/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, otp: otp }),
        credentials: 'include',
      });
      if (!res.ok) {
        var d = await res.json().catch(function() { return {}; });
        throw new Error(d.message || 'Invalid code');
      }
      hide('otp-screen');
      await initApp();
    } catch (e) {
      setMsg('otp-msg', e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  function backToLogin() {
    hide('otp-screen');
    show('login-screen');
    document.getElementById('otp-input').value = '';
    clearMsg('otp-msg');
  }

  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    document.getElementById('app').style.display = 'none';
    document.getElementById('email-input').value = '';
    show('login-screen');
  }

  document.getElementById('email-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendOTP(); });
  document.getElementById('otp-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') verifyOTP(); });

  // ── App ──

  async function apiFetch(path, opts) {
    var res = await fetch('/web/api/' + path, Object.assign({ credentials: 'include' }, opts));
    if (res.status === 401) { signOut(); return null; }
    var json = await res.json();
    return json.data;
  }

  async function initApp() {
    var me = await apiFetch('me');
    if (!me) return;

    var av = document.getElementById('sidebar-avatar');
    if (me.image) {
      av.innerHTML = '<img src="' + esc(me.image) + '" />';
    } else {
      av.textContent = initials(me.name);
    }
    document.getElementById('sidebar-email').textContent = me.email || '';
    document.getElementById('app').style.display = 'block';

    loadTasks();
    loadTeams();
    loadProfile(me);
  }

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
    var bar = document.getElementById('tasks-stats');
    bar.innerHTML =
      '<div class="stat-pill"><span class="stat-label">Total</span><span class="stat-count">' + total + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">Todo</span><span class="stat-count">' + todo + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">In Progress</span><span class="stat-count">' + inprog + '</span></div>' +
      '<div class="stat-pill"><span class="stat-label">Done</span><span class="stat-count">' + done + '</span></div>';
  }

  function renderTasks() {
    var filtered = currentFilter === 'all'
      ? allTasks
      : allTasks.filter(function(t) { return t.status === currentFilter; });
    var container = document.getElementById('tasks-container');
    if (!filtered.length) {
      var label = currentFilter === 'all' ? 'No tasks assigned to you yet.' : 'No ' + currentFilter.replace('_', ' ') + ' tasks.';
      container.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 12l2 2 4-4"/></svg></div>' +
          '<p>' + label + '</p>' +
        '</div>';
      return;
    }
    container.innerHTML =
      '<div class="task-card">' +
      filtered.map(function(t) {
        var done = t.status === 'done';
        return '<div class="task-row" id="task-' + t.id + '">' +
          '<div class="task-check ' + (done ? 'done' : '') + '" data-id="' + t.id + '" data-status="' + t.status + '" onclick="toggleTask(this.dataset.id, this.dataset.status)"></div>' +
          '<div class="task-body">' +
            '<div class="task-title' + (done ? ' done' : '') + '">' + esc(t.title) + '</div>' +
            '<div class="task-badges">' +
              statusBadge(t.status) +
              (t.priority ? priorityBadge(t.priority) : '') +
              (t.team ? '<span class="badge badge-team">' + esc(t.team.name) + '</span>' : '') +
            '</div>' +
          '</div>' +
          (t.dueDate ? '<span class="task-due">Due ' + fmt(t.dueDate) + '</span>' : '') +
        '</div>';
      }).join('') +
      '</div>';
  }

  function filterTasks(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTasks();
  }

  async function toggleTask(id, currentStatus) {
    var newStatus = currentStatus === 'done' ? 'todo' : 'done';
    var res = await apiFetch('tasks/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res) {
      allTasks = allTasks.map(function(t) {
        return t.id === id ? Object.assign({}, t, { status: newStatus }) : t;
      });
      renderStatsBar();
      renderTasks();
    }
  }

  async function loadTeams() {
    var teams = await apiFetch('teams');
    var container = document.getElementById('teams-container');
    if (!teams || !teams.length) {
      container.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg></div>' +
          '<p>You are not in any team yet.</p>' +
        '</div>';
      return;
    }
    container.innerHTML = teams.map(function(t) {
      return '<div class="team-card">' +
        '<div class="team-card-name">' + esc(t.name) + '</div>' +
        '<div class="team-stats">' +
          '<div class="team-stat">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="5" r="2"/><path d="M1.5 13c0-2.5 2-3 4.5-3s4.5.5 4.5 3"/><circle cx="12" cy="5" r="1.5"/><path d="M11 10c1 0 3 .5 3 2.5"/></svg>' +
            t._count.members + ' members' +
          '</div>' +
          '<div class="team-stat">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8l2 2 4-4"/></svg>' +
            t._count.tasks + ' tasks' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function loadProfile(me) {
    var container = document.getElementById('profile-container');
    container.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-avatar">' +
          (me.image ? '<img src="' + esc(me.image) + '" />' : initials(me.name)) +
        '</div>' +
        '<div class="profile-name">' + esc(me.name || 'Unknown') + '</div>' +
        '<div class="profile-email">' + esc(me.email) + '</div>' +
        '<div class="profile-row"><span class="p-label">Member since</span><span class="p-val">' + fmt(me.createdAt) + '</span></div>' +
      '</div>';
  }

  function showPage(name, btn) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('page-' + name).classList.add('active');
    btn.classList.add('active');
  }

  // ── Boot ──
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
