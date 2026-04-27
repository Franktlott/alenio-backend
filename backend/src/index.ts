import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { getSessionFromHeaders, type AppSession, type AppUser, verifyEmailPassword } from "./auth";
import { prisma } from "./prisma";
import { sampleRouter } from "./routes/sample";
import { teamsRouter } from "./routes/teams";
import { tasksRouter } from "./routes/tasks";
import { myTasksRouter } from "./routes/my-tasks";
import { messagesRouter } from "./routes/messages";
import { dmsRouter } from "./routes/dms";
import { templatesRouter } from "./routes/templates";
import { joinRequestsRouter } from "./routes/join-requests";
import { calendarRouter, initMeetingReminders } from "./routes/calendar";
import { subscriptionRouter } from "./routes/subscription";
import { activityRouter } from "./routes/activity";
import { topicsRouter } from "./routes/topics";
import { adminRouter } from "./routes/admin";
import { adminMobileRouter } from "./routes/admin-mobile";
import { webRouter } from "./routes/web-app";
import { pollsRouter } from "./routes/polls";
import { demoRouter } from "./routes/demo";
import { videoRouter } from "./routes/video";
import { usersRouter } from "./routes/users";
import { ogPreviewRouter } from "./routes/og-preview";
import { feedbackRouter } from "./routes/feedback";
import { sendPushNotificationsStrict } from "./lib/push";
import { getDatabasePublicSummary } from "./lib/database-public-summary";

type Variables = {
  user: AppUser | null;
  session: AppSession | null;
  authDebug: {
    neonAuthUserFound: boolean;
    matchedBy: "auth_user_id" | "email" | "created" | "none";
    authUserId: string | null;
    authEmail: string | null;
    finalAuthenticatedUserId: string | null;
  } | null;
};

const app = new Hono<{ Variables: Variables }>();
const BACKEND_BUILD_MARKER = env.BACKEND_BUILD_MARKER;

// CORS middleware - validates origin against allowlist
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecodeapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.dev$/,
  /^https:\/\/vibecode\.dev$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
    credentials: true,
  })
);

// Logging
app.use("*", logger());

// Auth session middleware - populates user/session for all routes
app.use("*", async (c, next) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    c.set("authDebug", {
      neonAuthUserFound: false,
      matchedBy: "none",
      authUserId: null,
      authEmail: null,
      finalAuthenticatedUserId: null,
    });
  } else {
    let user: { id: string; email: string; name: string; image: string | null } | null = null;
    const sessionEmail = session.user.email?.trim() ?? null;
    let matchedBy: "auth_user_id" | "email" | "created" | "none" = "none";

    // 1) Primary lookup by Neon auth user id.
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, image: true },
    });
    if (user) {
      matchedBy = "auth_user_id";
      if (sessionEmail && user.email !== sessionEmail) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: sessionEmail,
            name: session.user.name ?? user.name ?? sessionEmail.split("@")[0] ?? "User",
            image: session.user.image ?? user.image ?? undefined,
          },
          select: { id: true, email: true, name: true, image: true },
        });
      }
    } else if (sessionEmail) {
      // 2) Fallback by email to avoid duplicate rows for existing users.
      const byEmail = await prisma.user.findUnique({
        where: { email: sessionEmail },
        select: { id: true, email: true, name: true, image: true },
      });
      if (byEmail) {
        matchedBy = "email";
        user = byEmail;
      } else {
        // 3) Provision a new app user row.
        try {
          user = await prisma.user.create({
            data: {
              id: session.user.id,
              email: sessionEmail,
              name: session.user.name ?? sessionEmail.split("@")[0] ?? "User",
              image: session.user.image ?? undefined,
              emailVerified: true,
            },
            select: { id: true, email: true, name: true, image: true },
          });
          matchedBy = "created";
        } catch (err) {
          const code = (err as { code?: string } | null)?.code;
          // Concurrent create race: pick existing by email.
          if (code === "P2002") {
            user = await prisma.user.findUnique({
              where: { email: sessionEmail },
              select: { id: true, email: true, name: true, image: true },
            });
            matchedBy = user ? "email" : "none";
          } else {
            throw err;
          }
        }
      }
    }
    if (!user) {
      c.set("user", null);
      c.set("session", null);
      c.set("authDebug", {
        neonAuthUserFound: true,
        matchedBy: "none",
        authUserId: session.user.id,
        authEmail: sessionEmail,
        finalAuthenticatedUserId: null,
      });
      await next();
      return;
    }
    c.set("user", user);
    c.set("session", session.session);
    c.set("authDebug", {
      neonAuthUserFound: true,
      matchedBy,
      authUserId: session.user.id,
      authEmail: sessionEmail,
      finalAuthenticatedUserId: user.id,
    });
  }
  await next();
});

// Health check endpoint (database = which store this API instance uses; no secrets)
app.get("/health", (c) =>
  c.json({ status: "ok", database: getDatabasePublicSummary(), buildMarker: BACKEND_BUILD_MARKER })
);

// Email verified success page
app.get("/email-verified", (c) => {
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email Verified – Alenio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #EEF2FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 24px; box-shadow: 0 4px 32px rgba(67,97,238,0.12); max-width: 420px; width: 100%; overflow: hidden; }
    .header { background: linear-gradient(135deg, #4361EE, #7C3AED); padding: 40px 32px 32px; text-align: center; }
    .header img { width: 180px; height: auto; display: block; margin: 0 auto 12px; }
    .header p { color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 600; letter-spacing: 0.3px; }
    .body { padding: 40px 32px 32px; text-align: center; }
    .icon { font-size: 56px; display: block; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 800; color: #1E293B; margin-bottom: 12px; }
    p { font-size: 15px; color: #64748B; line-height: 1.6; margin-bottom: 28px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #ECFDF5; color: #059669; font-size: 13px; font-weight: 600; border-radius: 100px; padding: 6px 14px; margin-bottom: 28px; }
    .footer { border-top: 1px solid #F1F5F9; padding: 20px 32px; text-align: center; }
    .footer img { height: 48px; width: auto; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/static/alenio-logo-white.png" alt="Alenio" onerror="this.style.display='none'" />
      <p>Connect. Execute. Celebrate.</p>
    </div>
    <div class="body">
      <span class="icon">✅</span>
      <h1>Email verified!</h1>
      <div class="badge">✓ Account activated</div>
      <p>Your email address has been verified. Open the Alenio app and sign in to get started.</p>
    </div>
    <div class="footer">
      <img src="/static/lotttech-logo.png" alt="Lott Technology Group" onerror="this.style.display='none'" />
    </div>
  </div>
</body>
</html>`);
});

// Password reset deep-link redirect — email buttons use HTTPS (Gmail allows it),
// this route converts to the app scheme so iOS/Android opens the app
import { env as appEnv } from "./env";
app.get("/reset-password", (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);
  const deepLink = `${appEnv.APP_SCHEME}://reset-password?token=${encodeURIComponent(token)}`;
  return c.html(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${deepLink}">
<title>Redirecting…</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;">
<p>Opening Alenio…</p>
<p style="margin-top:16px;font-size:14px;color:#64748B;">
  <a href="${deepLink}" style="color:#4361EE;">Tap here if the app doesn't open</a>
</p>
</body></html>`);
});

// Static assets
app.get("/static/:filename", async (c) => {
  const { filename } = c.req.param();
  const path = `${import.meta.dir}/../static/${filename}`;
  const file = Bun.file(path);
  if (!(await file.exists())) return c.notFound();
  return new Response(file);
});

// File upload endpoint - proxies to Vibecode storage
app.post("/api/upload", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: { message: "No file provided", code: "VALIDATION_ERROR" } }, 400);
  }

  const storageForm = new FormData();
  storageForm.append("file", file);

  const response = await fetch("https://storage.vibecodeapp.com/v1/files/upload", {
    method: "POST",
    body: storageForm,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return c.json({ error: { message: (error as any).error || "Upload failed", code: "UPLOAD_ERROR" } }, 500);
  }

  const result = await response.json() as { file: { id: string; url: string; originalFilename: string; contentType: string; sizeBytes: number } };
  return c.json({ data: result.file });
});

// Update profile (name and/or image)
app.patch("/api/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name, image } = body;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(image !== undefined ? { image } : {}),
    },
    select: { id: true, name: true, email: true, image: true },
  });

  return c.json({ data: updated });
});

// Get current user profile with admin flag
app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, image: true, isAdmin: true },
  });
  return c.json({ data: fullUser });
});

// Debug: confirm auth session + app user row + active database target
app.get("/api/me/debug", async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const authDebug = c.get("authDebug");
  if (!user || !session) {
    return c.json({
      error: { message: "Unauthorized", code: "UNAUTHORIZED" },
      data: {
        authenticated: false,
        database: getDatabasePublicSummary(),
        buildMarker: BACKEND_BUILD_MARKER,
        neonAuthUserFound: authDebug?.neonAuthUserFound ?? false,
        appUserFound: false,
        matchedBy: authDebug?.matchedBy ?? "none",
        authUserId: authDebug?.authUserId ?? null,
        finalAuthenticatedUserId: null,
      },
    }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json({
    data: {
      authenticated: true,
      database: getDatabasePublicSummary(),
      buildMarker: BACKEND_BUILD_MARKER,
      authUserId: user.id,
      neonAuthUserFound: authDebug?.neonAuthUserFound ?? true,
      appUserFound: !!dbUser,
      matchedBy: authDebug?.matchedBy ?? "auth_user_id",
      authProviderUserId: authDebug?.authUserId ?? user.id,
      authProviderEmail: authDebug?.authEmail ?? user.email ?? null,
      finalAuthenticatedUserId: authDebug?.finalAuthenticatedUserId ?? user.id,
      appUser: dbUser,
      sessionExpiresAt: session.expiresAt ?? null,
    },
  });
});

// Save push token
app.post("/api/push-token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const { token } = await c.req.json();
  if (token !== null && typeof token !== "string") return c.json({ error: { message: "Token must be string or null" } }, 400);
  const cleaned = typeof token === "string" ? token.trim() : null;
  await prisma.user.update({ where: { id: user.id }, data: { pushToken: cleaned && cleaned.length ? cleaned : null } });
  return c.json({ data: { ok: true } });
});
// Test push notification (sends a real push to the current user's device)
app.post("/api/push-test", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { pushToken: true } });
  const token = record?.pushToken;
  if (!token) return c.json({ data: { ok: false, error: "no_token" } });
  try {
    await sendPushNotificationsStrict([{ token, title: "Push Test", body: "Your push notifications are working!" }]);
    return c.json({ data: { ok: true, token: token.substring(0, 30) + "..." } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ data: { ok: false, error: msg } });
  }
});

// Get notification preferences
app.get("/api/notification-preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const prefs = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notifMessages: true, notifTaskAssigned: true, notifTaskDue: true, notifMeetings: true, notifTone: true, pushToken: true },
  });
  return c.json({ data: { ...prefs, hasToken: !!prefs?.pushToken } });
});

// Update notification preferences
app.patch("/api/notification-preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json();
  const { notifMessages, notifTaskAssigned, notifTaskDue, notifMeetings, notifTone } = body;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(notifMessages !== undefined ? { notifMessages } : {}),
      ...(notifTaskAssigned !== undefined ? { notifTaskAssigned } : {}),
      ...(notifTaskDue !== undefined ? { notifTaskDue } : {}),
      ...(notifMeetings !== undefined ? { notifMeetings } : {}),
      ...(notifTone !== undefined ? { notifTone } : {}),
    },
    select: { notifMessages: true, notifTaskAssigned: true, notifTaskDue: true, notifMeetings: true, notifTone: true },
  });
  return c.json({ data: updated });
});

app.get("/api/users/search", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const q = c.req.query("q")?.trim() ?? "";
  if (!q) return c.json({ data: [] });

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: user.id } }, // exclude self
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true, image: true },
    take: 20,
  });

  return c.json({ data: users });
});

app.delete("/api/user", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { password } = body;

  if (!password || typeof password !== "string") {
    return c.json({ error: { message: "Password required", code: "VALIDATION_ERROR" } }, 400);
  }

  // Verify password using Better Auth's own sign-in (handles its custom hash format)
  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);

  try {
    const verified = await verifyEmailPassword(fullUser.email, password);
    if (!verified) throw new Error("Sign-in failed");
  } catch {
    return c.json({ error: { message: "Incorrect password", code: "INVALID_PASSWORD" } }, 401);
  }

  // Delete records that don't have onDelete: Cascade, in dependency order
  const uid = user.id;
  await prisma.pollVote.deleteMany({ where: { userId: uid } });
  await prisma.poll.deleteMany({ where: { createdById: uid } });
  await prisma.directMessage.deleteMany({ where: { senderId: uid } });
  await prisma.message.deleteMany({ where: { senderId: uid } });
  await prisma.topic.deleteMany({ where: { createdById: uid } });
  await prisma.taskTemplate.deleteMany({ where: { createdById: uid } });
  await prisma.task.deleteMany({ where: { creatorId: uid } });
  // Delete user (cascades: sessions, accounts, team memberships, reactions, etc.)
  await prisma.user.delete({ where: { id: uid } });

  return c.json({ data: { deleted: true } });
});

// Routes
app.route("/api/sample", sampleRouter);
app.route("/api/users", usersRouter);
app.route("/api/teams", teamsRouter);
app.route("/api/teams/:teamId/tasks", tasksRouter);
app.route("/api/tasks/mine", myTasksRouter);
app.route("/api/teams/:teamId/messages", messagesRouter);
app.route("/api/dms", dmsRouter);
app.route("/api/teams/:teamId/templates", templatesRouter);
app.route("/api/join-requests", joinRequestsRouter);
app.route("/api/teams", calendarRouter);
app.route("/api/teams/:teamId/subscription", subscriptionRouter);
app.route("/api/teams", activityRouter);
app.route("/api/teams", topicsRouter);
app.route("/api/teams", pollsRouter);
app.route("/api/demo", demoRouter);
app.route("/api/og-preview", ogPreviewRouter);
app.route("/api/feedback", feedbackRouter);
app.route("/api/video", videoRouter);
app.route("/admin", adminRouter);
app.route("/api/admin-mobile", adminMobileRouter);
app.route("/web", webRouter);

// ── Auto-cleanup job ────────────────────────────────────────────
// Deletes calendar events, tasks, and task photos older than 45 days
async function runCleanup() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);

  try {
    // Delete calendar events whose start date is older than 45 days
    const deletedEvents = await prisma.calendarEvent.deleteMany({
      where: { startDate: { lt: cutoff } },
    });

    // Delete tasks whose due date is older than 45 days
    // (cascades to subtasks, assignments, attachmentUrl reference)
    const deletedTasks = await prisma.task.deleteMany({
      where: { dueDate: { lt: cutoff } },
    });

    if (deletedEvents.count > 0 || deletedTasks.count > 0) {
      console.log(`[cleanup] Removed ${deletedEvents.count} events, ${deletedTasks.count} tasks older than 45 days`);
    }
  } catch (err) {
    console.error("[cleanup] Error during cleanup:", err);
  }
}

// Run once on startup, then every 24 hours
runCleanup();
setInterval(runCleanup, 60 * 60 * 1000);

// Re-schedule any pending meeting reminders after server restart
initMeetingReminders();

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
