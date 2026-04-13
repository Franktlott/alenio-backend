import { Hono } from "hono";
import { env } from "../env";
import { prisma } from "../prisma";

const adminRouter = new Hono();

// Middleware: check admin password
adminRouter.use("/api/*", async (c, next) => {
  const pw = c.req.header("x-admin-password");
  if (pw !== env.ADMIN_PASSWORD) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Stats
adminRouter.get("/api/stats", async (c) => {
  const [users, teams, tasks, messages] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.task.count(),
    prisma.message.count(),
  ]);
  return c.json({ data: { users, teams, tasks, messages } });
});

// Users list
adminRouter.get("/api/users", async (c) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, image: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ data: users });
});

// Teams list
adminRouter.get("/api/teams", async (c) => {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true, tasks: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ data: teams });
});

// Tasks list
adminRouter.get("/api/tasks", async (c) => {
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      team: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ data: tasks });
});

// Promote a user to admin (or demote)
adminRouter.post("/api/promote-user", async (c) => {
  const { email, isAdmin } = await c.req.json();
  if (!email) return c.json({ error: "Email required" }, 400);

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return c.json({ error: "User not found" }, 404);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: isAdmin !== false },
    select: { id: true, name: true, email: true, isAdmin: true },
  });

  return c.json({ data: updated });
});

// Serve the admin dashboard HTML
adminRouter.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

    /* Login */
    #login-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; width: 360px; text-align: center; }
    .login-card h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .login-card p { color: #94a3b8; font-size: 14px; margin-bottom: 28px; }
    .login-card input { width: 100%; padding: 12px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; color: #e2e8f0; font-size: 15px; margin-bottom: 16px; outline: none; }
    .login-card input:focus { border-color: #6366f1; }
    .btn { width: 100%; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #4f46e5; }
    .error-msg { color: #f87171; font-size: 13px; margin-top: 12px; display: none; }

    /* Dashboard */
    #dashboard { display: none; }
    .header { background: #1e293b; border-bottom: 1px solid #334155; padding: 16px 32px; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 20px; font-weight: 700; flex: 1; }
    .header .badge { background: #6366f1; color: white; font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
    .logout-btn { background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .logout-btn:hover { border-color: #f87171; color: #f87171; }

    .main { padding: 32px; max-width: 1200px; margin: 0 auto; }

    /* Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
    .stat-card .label { color: #94a3b8; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
    .stat-card .value { font-size: 36px; font-weight: 700; }
    .stat-card.purple .value { color: #a78bfa; }
    .stat-card.blue .value { color: #60a5fa; }
    .stat-card.green .value { color: #34d399; }
    .stat-card.orange .value { color: #fb923c; }

    /* Tabs */
    .tabs { display: flex; gap: 4px; margin-bottom: 20px; background: #1e293b; border-radius: 10px; padding: 4px; width: fit-content; }
    .tab { padding: 8px 20px; border-radius: 8px; border: none; background: transparent; color: #94a3b8; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.15s; }
    .tab.active { background: #6366f1; color: white; }
    .tab:hover:not(.active) { color: #e2e8f0; }

    /* Table */
    .table-wrap { background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead th { background: #0f172a; padding: 12px 16px; text-align: left; color: #64748b; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody tr { border-top: 1px solid #1e293b; transition: background 0.1s; }
    tbody tr:hover { background: #253347; }
    tbody td { padding: 12px 16px; color: #cbd5e1; }
    tbody td:first-child { color: #e2e8f0; font-weight: 500; }

    .avatar { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: white; margin-right: 10px; vertical-align: middle; overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .name-cell { display: flex; align-items: center; }

    .badge-status { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-todo { background: #1e3a5f; color: #60a5fa; }
    .badge-in-progress { background: #3b1f6e; color: #a78bfa; }
    .badge-done { background: #064e3b; color: #34d399; }
    .badge-cancelled { background: #3b1111; color: #f87171; }

    .badge-priority { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-low { background: #1e3a2f; color: #6ee7b7; }
    .badge-medium { background: #3b2f12; color: #fbbf24; }
    .badge-high { background: #3b1a1a; color: #f87171; }

    .loading { text-align: center; padding: 40px; color: #64748b; }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #94a3b8; }

    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body>

<!-- Login -->
<div id="login-screen">
  <div class="login-card">
    <h1>🔐 Admin</h1>
    <p>Enter your admin password to continue</p>
    <input type="password" id="pw-input" placeholder="Password" autocomplete="current-password" />
    <button class="btn" onclick="login()">Sign In</button>
    <div class="error-msg" id="error-msg">Incorrect password. Try again.</div>
  </div>
</div>

<!-- Dashboard -->
<div id="dashboard">
  <div class="header">
    <h1>Admin Dashboard</h1>
    <span class="badge">Live</span>
    <button class="logout-btn" onclick="logout()">Sign Out</button>
  </div>
  <div class="main">
    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card purple">
        <div class="label">Total Users</div>
        <div class="value" id="stat-users">–</div>
      </div>
      <div class="stat-card blue">
        <div class="label">Total Teams</div>
        <div class="value" id="stat-teams">–</div>
      </div>
      <div class="stat-card green">
        <div class="label">Total Tasks</div>
        <div class="value" id="stat-tasks">–</div>
      </div>
      <div class="stat-card orange">
        <div class="label">Total Messages</div>
        <div class="value" id="stat-messages">–</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('users')">Users</button>
      <button class="tab" onclick="switchTab('teams')">Teams</button>
      <button class="tab" onclick="switchTab('tasks')">Tasks</button>
    </div>

    <!-- Users Tab -->
    <div class="tab-content active" id="tab-users">
      <div class="table-wrap">
        <div class="loading" id="users-loading">Loading...</div>
        <table id="users-table" style="display:none">
          <thead><tr>
            <th>Name</th>
            <th>Email</th>
            <th>Joined</th>
          </tr></thead>
          <tbody id="users-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Teams Tab -->
    <div class="tab-content" id="tab-teams">
      <div class="table-wrap">
        <div class="loading" id="teams-loading">Loading...</div>
        <table id="teams-table" style="display:none">
          <thead><tr>
            <th>Team Name</th>
            <th>Members</th>
            <th>Tasks</th>
            <th>Created</th>
          </tr></thead>
          <tbody id="teams-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Tasks Tab -->
    <div class="tab-content" id="tab-tasks">
      <div class="table-wrap">
        <div class="loading" id="tasks-loading">Loading...</div>
        <table id="tasks-table" style="display:none">
          <thead><tr>
            <th>Title</th>
            <th>Team</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due Date</th>
          </tr></thead>
          <tbody id="tasks-body"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script>
  let adminPw = '';

  async function login() {
    const pw = document.getElementById('pw-input').value;
    if (!pw) return;
    const res = await fetch('/admin/api/stats', { headers: { 'x-admin-password': pw } });
    if (res.status === 401) {
      document.getElementById('error-msg').style.display = 'block';
      return;
    }
    adminPw = pw;
    document.getElementById('error-msg').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadAll();
  }

  document.getElementById('pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  function logout() {
    adminPw = '';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('pw-input').value = '';
  }

  async function apiFetch(path) {
    const res = await fetch('/admin/api/' + path, { headers: { 'x-admin-password': adminPw } });
    const json = await res.json();
    return json.data;
  }

  function fmt(dateStr) {
    if (!dateStr) return '–';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function statusBadge(status) {
    const map = { todo: 'badge-todo', 'in-progress': 'badge-in-progress', in_progress: 'badge-in-progress', done: 'badge-done', cancelled: 'badge-cancelled' };
    const cls = map[status?.toLowerCase()] || 'badge-todo';
    return \`<span class="badge-status \${cls}">\${status || 'todo'}</span>\`;
  }

  function priorityBadge(priority) {
    const map = { low: 'badge-low', medium: 'badge-medium', high: 'badge-high' };
    const cls = map[priority?.toLowerCase()] || 'badge-low';
    return \`<span class="badge-priority \${cls}">\${priority || 'low'}</span>\`;
  }

  async function loadStats() {
    const stats = await apiFetch('stats');
    document.getElementById('stat-users').textContent = stats.users;
    document.getElementById('stat-teams').textContent = stats.teams;
    document.getElementById('stat-tasks').textContent = stats.tasks;
    document.getElementById('stat-messages').textContent = stats.messages;
  }

  async function loadUsers() {
    const users = await apiFetch('users');
    const tbody = document.getElementById('users-body');
    tbody.innerHTML = users.map(u => \`
      <tr>
        <td>
          <div class="name-cell">
            <div class="avatar">\${u.image ? \`<img src="\${u.image}" onerror="this.style.display='none'" />\` : ''}\${initials(u.name)}</div>
            \${u.name || 'Unknown'}
          </div>
        </td>
        <td>\${u.email}</td>
        <td>\${fmt(u.createdAt)}</td>
      </tr>
    \`).join('');
    document.getElementById('users-loading').style.display = 'none';
    document.getElementById('users-table').style.display = 'table';
  }

  async function loadTeams() {
    const teams = await apiFetch('teams');
    const tbody = document.getElementById('teams-body');
    tbody.innerHTML = teams.map(t => \`
      <tr>
        <td>\${t.name}</td>
        <td>\${t._count.members}</td>
        <td>\${t._count.tasks}</td>
        <td>\${fmt(t.createdAt)}</td>
      </tr>
    \`).join('');
    document.getElementById('teams-loading').style.display = 'none';
    document.getElementById('teams-table').style.display = 'table';
  }

  async function loadTasks() {
    const tasks = await apiFetch('tasks');
    const tbody = document.getElementById('tasks-body');
    tbody.innerHTML = tasks.map(t => \`
      <tr>
        <td>\${t.title}</td>
        <td>\${t.team?.name || '–'}</td>
        <td>\${statusBadge(t.status)}</td>
        <td>\${priorityBadge(t.priority)}</td>
        <td>\${fmt(t.dueDate)}</td>
      </tr>
    \`).join('');
    document.getElementById('tasks-loading').style.display = 'none';
    document.getElementById('tasks-table').style.display = 'table';
  }

  function loadAll() {
    loadStats();
    loadUsers();
    loadTeams();
    loadTasks();
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
  }
</script>
</body>
</html>`;
  return c.html(html);
});

export { adminRouter };
