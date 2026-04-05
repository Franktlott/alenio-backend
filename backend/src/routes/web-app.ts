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

// Serve the web portal SPA
webRouter.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alenio — Web</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}

    /* ── Auth screens ── */
    .auth-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .auth-card{background:#1e293b;border:1px solid #334155;border-radius:20px;padding:40px;width:100%;max-width:400px}
    .auth-card .logo{font-size:28px;font-weight:800;margin-bottom:4px;background:linear-gradient(135deg,#818cf8,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .auth-card .sub{color:#64748b;font-size:14px;margin-bottom:32px}
    .auth-card h2{font-size:20px;font-weight:700;margin-bottom:4px}
    .auth-card p{color:#64748b;font-size:13px;margin-bottom:28px}
    .field-label{display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
    .field{width:100%;padding:12px 16px;background:#0f172a;border:1.5px solid #334155;border-radius:12px;color:#e2e8f0;font-size:15px;outline:none;transition:border .2s}
    .field:focus{border-color:#6366f1}
    .btn-primary{width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:16px;transition:opacity .2s}
    .btn-primary:hover{opacity:.9}
    .btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .btn-ghost{background:transparent;border:none;color:#6366f1;font-size:13px;cursor:pointer;margin-top:12px;padding:4px}
    .btn-ghost:hover{text-decoration:underline}
    .msg{font-size:13px;margin-top:12px;padding:10px 14px;border-radius:10px}
    .msg.error{background:#3b1111;color:#f87171}
    .msg.info{background:#1e3a5f;color:#93c5fd}
    .otp-hint{color:#64748b;font-size:12px;margin-top:8px}

    /* ── App shell ── */
    #app{display:none}
    .topbar{background:#1e293b;border-bottom:1px solid #334155;padding:0 24px;height:56px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10}
    .topbar .brand{font-size:17px;font-weight:800;background:linear-gradient(135deg,#818cf8,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-right:8px}
    .nav-btn{padding:6px 14px;border-radius:8px;border:none;background:transparent;color:#94a3b8;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .nav-btn.active,.nav-btn:hover{background:#334155;color:#e2e8f0}
    .spacer{flex:1}
    .avatar-chip{display:flex;align-items:center;gap:8px;background:#0f172a;padding:5px 12px 5px 6px;border-radius:20px;cursor:default}
    .avatar-sm{width:28px;height:28px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;overflow:hidden;flex-shrink:0}
    .avatar-sm img{width:100%;height:100%;object-fit:cover}
    .avatar-name{font-size:13px;font-weight:500;color:#e2e8f0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sign-out-btn{margin-left:8px;padding:6px 12px;border-radius:8px;background:transparent;border:1px solid #334155;color:#94a3b8;font-size:12px;cursor:pointer}
    .sign-out-btn:hover{border-color:#f87171;color:#f87171}

    .main{padding:28px 24px;max-width:960px;margin:0 auto}
    .page{display:none}.page.active{display:block}
    .page-title{font-size:22px;font-weight:700;margin-bottom:20px}

    /* ── Cards / Grid ── */
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-bottom:32px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;transition:border-color .15s}
    .card:hover{border-color:#475569}
    .card .card-title{font-size:15px;font-weight:600;margin-bottom:6px}
    .card .card-meta{color:#64748b;font-size:12px;display:flex;gap:12px}
    .card .card-meta span{display:flex;align-items:center;gap:4px}

    /* ── Task list ── */
    .task-list{display:flex;flex-direction:column;gap:10px}
    .task-item{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;transition:border-color .15s}
    .task-item:hover{border-color:#475569}
    .task-check{width:20px;height:20px;border-radius:6px;border:2px solid #475569;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
    .task-check.done{background:#6366f1;border-color:#6366f1}
    .task-check.done::after{content:'✓';color:#fff;font-size:12px;font-weight:700}
    .task-info{flex:1;min-width:0}
    .task-title{font-size:14px;font-weight:500}
    .task-title.done{text-decoration:line-through;color:#475569}
    .task-meta{font-size:11px;color:#64748b;margin-top:3px;display:flex;gap:8px}
    .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
    .badge-todo{background:#1e3a5f;color:#60a5fa}
    .badge-in_progress,.badge-in-progress{background:#3b1f6e;color:#a78bfa}
    .badge-done{background:#064e3b;color:#34d399}
    .badge-cancelled{background:#3b1111;color:#f87171}
    .badge-low{background:#1e3a2f;color:#6ee7b7}
    .badge-medium{background:#3b2f12;color:#fbbf24}
    .badge-high{background:#3b1a1a;color:#f87171}
    .badge-team{background:#1e293b;border:1px solid #334155;color:#94a3b8}

    .empty{text-align:center;padding:48px 24px;color:#475569}
    .empty .empty-icon{font-size:40px;margin-bottom:12px}
    .empty p{font-size:14px}
    .loading{text-align:center;padding:40px;color:#475569;font-size:14px}

    /* ── Profile ── */
    .profile-card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;max-width:480px}
    .profile-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#38bdf8);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;margin-bottom:16px;overflow:hidden}
    .profile-avatar img{width:100%;height:100%;object-fit:cover}
    .profile-name{font-size:20px;font-weight:700;margin-bottom:4px}
    .profile-email{color:#64748b;font-size:13px;margin-bottom:20px}
    .profile-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid #1e293b}
    .profile-row .label{color:#64748b;font-size:13px}
    .profile-row .val{font-size:13px;font-weight:500}

    /* ── Filters ── */
    .filters{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
    .filter-btn{padding:6px 14px;border-radius:20px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-weight:500;transition:all .15s}
    .filter-btn.active{background:#6366f1;border-color:#6366f1;color:#fff}
  </style>
</head>
<body>

<!-- ── Login ── -->
<div id="login-screen" class="auth-wrap">
  <div class="auth-card">
    <div class="logo">Alenio</div>
    <div class="sub">Team workspace</div>
    <h2>Sign in</h2>
    <p>Enter your email to receive a one-time code</p>
    <label class="field-label">Email address</label>
    <input class="field" type="text" id="email-input" placeholder="you@example.com" autocapitalize="off" autocorrect="off" autocomplete="email" />
    <div id="login-msg"></div>
    <button type="button" class="btn-primary" id="send-otp-btn" onclick="sendOTP()">Continue</button>
  </div>
</div>

<!-- ── OTP verification ── -->
<div id="otp-screen" class="auth-wrap" style="display:none">
  <div class="auth-card">
    <div class="logo">Alenio</div>
    <div class="sub">Team workspace</div>
    <h2>Check your email</h2>
    <p id="otp-desc">We sent a 6-digit code to your email</p>
    <label class="field-label">One-time code</label>
    <input class="field" type="text" id="otp-input" placeholder="000000" maxlength="6" inputmode="numeric" />
    <div id="otp-msg"></div>
    <button type="button" class="btn-primary" id="verify-btn" onclick="verifyOTP()">Sign In</button>
    <br/><button class="btn-ghost" onclick="backToLogin()">← Use different email</button>
  </div>
</div>

<!-- ── App ── -->
<div id="app">
  <div class="topbar">
    <span class="brand">Alenio</span>
    <button class="nav-btn active" onclick="showPage('tasks', this)">My Tasks</button>
    <button class="nav-btn" onclick="showPage('teams', this)">Teams</button>
    <button class="nav-btn" onclick="showPage('profile', this)">Profile</button>
    <div class="spacer"></div>
    <div class="avatar-chip">
      <div class="avatar-sm" id="topbar-avatar"></div>
      <span class="avatar-name" id="topbar-name"></span>
    </div>
    <button class="sign-out-btn" onclick="signOut()">Sign out</button>
  </div>

  <div class="main">

    <!-- Tasks -->
    <div class="page active" id="page-tasks">
      <div class="page-title">My Tasks</div>
      <div class="filters" id="task-filters">
        <button class="filter-btn active" onclick="filterTasks('all', this)">All</button>
        <button class="filter-btn" onclick="filterTasks('todo', this)">To Do</button>
        <button class="filter-btn" onclick="filterTasks('in_progress', this)">In Progress</button>
        <button class="filter-btn" onclick="filterTasks('done', this)">Done</button>
      </div>
      <div id="tasks-container"><div class="loading">Loading tasks…</div></div>
    </div>

    <!-- Teams -->
    <div class="page" id="page-teams">
      <div class="page-title">My Teams</div>
      <div id="teams-container" class="grid"><div class="loading">Loading teams…</div></div>
    </div>

    <!-- Profile -->
    <div class="page" id="page-profile">
      <div class="page-title">Profile</div>
      <div id="profile-container"><div class="loading">Loading…</div></div>
    </div>

  </div>
</div>

<script>
  let currentEmail = '';
  let allTasks = [];
  let currentFilter = 'all';

  function show(id) { document.getElementById(id).style.display = 'flex'; }
  function hide(id) { document.getElementById(id).style.display = 'none'; }
  function setMsg(id, msg, type) {
    const el = document.getElementById(id);
    el.className = 'msg ' + type;
    el.textContent = msg;
  }
  function clearMsg(id) { const el = document.getElementById(id); el.className = ''; el.textContent = ''; }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function fmt(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function statusBadge(s) {
    const label = { todo: 'Todo', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled' };
    return '<span class="badge badge-' + s + '">' + (label[s] || s) + '</span>';
  }
  function priorityBadge(p) {
    return '<span class="badge badge-' + p + '">' + (p || '') + '</span>';
  }

  // ── Auth ──

  async function sendOTP() {
    const email = document.getElementById('email-input').value.trim();
    if (!email) return;
    const btn = document.getElementById('send-otp-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    clearMsg('login-msg');
    try {
      const res = await fetch('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'sign-in' }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to send code');
      }
      currentEmail = email;
      hide('login-screen');
      document.getElementById('otp-desc').textContent = 'We sent a 6-digit code to ' + email;
      document.getElementById('otp-screen').style.display = 'flex';
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Something went wrong. Please try again.';
      setMsg('login-msg', msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continue';
    }
  }

  async function verifyOTP() {
    const otp = document.getElementById('otp-input').value.trim();
    if (!otp || otp.length < 6) return;
    const btn = document.getElementById('verify-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    clearMsg('otp-msg');
    try {
      const res = await fetch('/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, otp }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
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

  document.getElementById('email-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendOTP(); });
  document.getElementById('otp-input').addEventListener('keydown', e => { if (e.key === 'Enter') verifyOTP(); });

  // ── App ──

  async function apiFetch(path, opts) {
    const res = await fetch('/web/api/' + path, { credentials: 'include', ...opts });
    if (res.status === 401) { signOut(); return null; }
    const json = await res.json();
    return json.data;
  }

  async function initApp() {
    const me = await apiFetch('me');
    if (!me) return;
    // Set topbar avatar
    const av = document.getElementById('topbar-avatar');
    av.innerHTML = me.image ? '<img src="' + me.image + '" />' : initials(me.name);
    document.getElementById('topbar-name').textContent = me.name || me.email;
    document.getElementById('app').style.display = 'block';
    loadTasks();
    loadTeams();
    loadProfile(me);
  }

  async function loadTasks() {
    const tasks = await apiFetch('tasks');
    allTasks = tasks || [];
    renderTasks();
  }

  function renderTasks() {
    const filtered = currentFilter === 'all' ? allTasks : allTasks.filter(t => t.status === currentFilter);
    const container = document.getElementById('tasks-container');
    if (!filtered.length) {
      container.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><p>' + (currentFilter === 'all' ? 'No tasks assigned to you yet.' : 'No ' + currentFilter.replace('_',' ') + ' tasks.') + '</p></div>';
      return;
    }
    container.innerHTML = '<div class="task-list">' + filtered.map(t => {
      const done = t.status === 'done';
      return '<div class="task-item" id="task-' + t.id + '">' +
        '<div class="task-check ' + (done ? 'done' : '') + '" data-id="' + t.id + '" data-status="' + t.status + '" onclick="toggleTask(this.dataset.id,this.dataset.status)"></div>' +
        '<div class="task-info">' +
          '<div class="task-title ' + (done ? 'done' : '') + '">' + esc(t.title) + '</div>' +
          '<div class="task-meta">' +
            statusBadge(t.status) +
            (t.priority ? priorityBadge(t.priority) : '') +
            (t.team ? '<span class="badge badge-team">' + esc(t.team.name) + '</span>' : '') +
            (t.dueDate ? '<span>Due ' + fmt(t.dueDate) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function filterTasks(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
  }

  async function toggleTask(id, currentStatus) {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    const res = await apiFetch('tasks/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res) {
      allTasks = allTasks.map(t => t.id === id ? { ...t, status: newStatus } : t);
      renderTasks();
    }
  }

  async function loadTeams() {
    const teams = await apiFetch('teams');
    const container = document.getElementById('teams-container');
    if (!teams || !teams.length) {
      container.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><p>You are not in any team yet.</p></div>';
      return;
    }
    container.innerHTML = teams.map(t => {
      return '<div class="card">' +
        '<div class="card-title">' + esc(t.name) + '</div>' +
        '<div class="card-meta">' +
          '<span>👤 ' + t._count.members + ' members</span>' +
          '<span>✅ ' + t._count.tasks + ' tasks</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function loadProfile(me) {
    const container = document.getElementById('profile-container');
    container.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-avatar">' +
          (me.image ? '<img src="' + me.image + '" />' : initials(me.name)) +
        '</div>' +
        '<div class="profile-name">' + esc(me.name || 'Unknown') + '</div>' +
        '<div class="profile-email">' + esc(me.email) + '</div>' +
        '<div class="profile-row"><span class="label">Member since</span><span class="val">' + fmt(me.createdAt) + '</span></div>' +
      '</div>';
  }

  function showPage(name, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    btn.classList.add('active');
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ──
  (async () => {
    const res = await fetch('/api/auth/get-session', { credentials: 'include' });
    const data = await res.json().catch(() => null);
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
