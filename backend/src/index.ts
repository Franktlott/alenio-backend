import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { senecaAvailable, senecaDiagnostics } from "./lib/seneca-openai";
import { getSessionFromHeaders, type AppSession, type AppUser, verifyEmailPassword } from "./auth";
import { confirmEmailChange, normalizeEmailInput, requestEmailChange } from "./lib/email-change";
import { prisma } from "./prisma";
import { sampleRouter } from "./routes/sample";
import { teamsRouter } from "./routes/teams";
import { goLeaderPinRouter } from "./routes/go-leader-pin";
import { tasksRouter } from "./routes/tasks";
import { myTasksRouter } from "./routes/my-tasks";
import { messagesRouter } from "./routes/messages";
import { dmsRouter } from "./routes/dms";
import { templatesRouter } from "./routes/templates";
import { oneOnOneTemplatesRouter } from "./routes/one-on-one-templates";
import { checkInTemplateLibraryRouter } from "./routes/check-in-template-library";
import { oneOnOneMeetingsRouter } from "./routes/one-on-one-meetings";
import { joinRequestsRouter } from "./routes/join-requests";
import { calendarRouter, initMeetingReminders } from "./routes/calendar";
import { subscriptionRouter } from "./routes/subscription";
import { activityRouter } from "./routes/activity";
import { topicsRouter } from "./routes/topics";
import { adminRouter } from "./routes/admin";
import { adminMobileRouter } from "./routes/admin-mobile";
import { webRouter } from "./routes/web-app";
import { handleStripeWebhook } from "./routes/stripe-webhook";
import { pollsRouter } from "./routes/polls";
import { demoRouter } from "./routes/demo";
import { videoRouter } from "./routes/video";
import { usersRouter } from "./routes/users";
import { ogPreviewRouter } from "./routes/og-preview";
import { feedbackRouter } from "./routes/feedback";
import { sendPushNotificationsStrict } from "./lib/push";
import { getDatabasePublicSummary } from "./lib/database-public-summary";
import { syncAppUserFromNeonAuth } from "./lib/ensure-app-user";
import { deleteAppUserCompletely } from "./lib/delete-app-user";
import {
  deleteStorageObjectByUrlIfOwned,
  isFirebaseStorageConfigured,
  uploadFileToFirebaseStorage,
} from "./lib/firebase-storage";
import { syncPrismaSchemaOnStartup } from "./lib/sync-prisma-schema";
import { ensureOneOnOneSchema } from "./lib/ensure-one-on-one-schema";
import { ensureDevelopmentPlanSchema } from "./lib/ensure-development-plan-schema";
import { ensureTeamInviteSchema } from "./lib/ensure-team-invite-schema";
import { ensureRecurrenceSeriesSchema } from "./lib/ensure-recurrence-series-schema";
import { ensureUserTimezoneSchema } from "./lib/ensure-user-timezone-schema";
import { ensureCalendarApprovalSchema } from "./lib/ensure-calendar-approval-schema";
import { ensureWorkplaceStandardsSchema } from "./lib/ensure-workplace-standards-schema";
import { ensureGoLoginSchema } from "./lib/ensure-go-login-schema";
import { ensureWorkplaceAlertsSchema } from "./lib/ensure-workplace-alerts-schema";
import { ensureBriefingsSchema } from "./lib/ensure-briefings-schema";
import { ensureWalksSchema } from "./lib/ensure-walks-schema";
import { ensureGoFrontendSettingsSchema } from "./lib/ensure-go-frontend-settings-schema";
import { ensureGoLeaderPinSchema } from "./lib/ensure-go-leader-pin-schema";
import { ensureTempChecksSchema } from "./lib/ensure-temp-checks-schema";
import { ensureCalendarConnectionSchema } from "./lib/ensure-calendar-connection-schema";
import { calendarConnectionsRouter } from "./routes/calendar-connections";
import { developmentGoalsRouter } from "./routes/development-goals";
import { senecaRouter } from "./routes/seneca";
import { senecaTeamRouter } from "./routes/seneca-team";
import { teamInvitesPublicRouter } from "./routes/team-invites";
import { publicChecklistHubsRouter } from "./routes/public-checklist-hubs";
import { publicChecklistLocationsRouter } from "./routes/public-checklist-locations";
import { publicGoLinkRouter } from "./routes/public-go-link";
import { checklistLocationsRouter } from "./routes/checklist-locations";
import { walksRouter } from "./routes/walks";
import { tempChecksRouter } from "./routes/temp-checks";
import { isValidTimeZone } from "./lib/timezone";
import { redeemPendingInvitesForUser } from "./lib/team-invites";

const isProduction = env.NODE_ENV === "production";

/** Railway preDeploy already runs `prisma db push`; avoid blocking process start in prod. */
if (!isProduction) {
  syncPrismaSchemaOnStartup();
}

/** Dev safety net + prod fallback when preDeploy db push missed a table. */
const startupSchemaReady = Promise.all([
  ...(isProduction
    ? [ensureGoLoginSchema(prisma), ensureWorkplaceAlertsSchema(prisma), ensureBriefingsSchema(prisma), ensureWalksSchema(prisma), ensureGoFrontendSettingsSchema(prisma), ensureGoLeaderPinSchema(prisma), ensureTempChecksSchema(prisma)]
    : [
        ensureOneOnOneSchema(prisma),
        ensureDevelopmentPlanSchema(prisma),
        ensureTeamInviteSchema(prisma),
        ensureRecurrenceSeriesSchema(prisma),
        ensureUserTimezoneSchema(prisma),
        ensureCalendarApprovalSchema(prisma),
        ensureWorkplaceStandardsSchema(prisma),
        ensureCalendarConnectionSchema(prisma),
        ensureGoLoginSchema(prisma),
        ensureWorkplaceAlertsSchema(prisma),
        ensureBriefingsSchema(prisma),
        ensureWalksSchema(prisma),
        ensureGoFrontendSettingsSchema(prisma),
        ensureGoLeaderPinSchema(prisma),
        ensureTempChecksSchema(prisma),
      ]),
]);

function isFastPublicPath(path: string): boolean {
  return path === "/health";
}

function buildHealthPayload() {
  let authProjectHint: string | null = null;
  try {
    authProjectHint = new URL(env.NEON_AUTH_URL).hostname;
  } catch {
    authProjectHint = null;
  }
  return {
    status: "ok",
    database: getDatabasePublicSummary(),
    buildMarker: env.BACKEND_BUILD_MARKER,
    storageProvider: "firebase",
    storageConfigured: isFirebaseStorageConfigured(),
    senecaConfigured: senecaAvailable(),
    senecaDiagnostics: senecaDiagnostics(),
    /** Compare with EXPO_PUBLIC_NEON_AUTH_URL from the app — hostnames must be the same Neon Auth project. */
    neonAuthHostname: authProjectHint,
  };
}

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

// Fast health for Railway — must not wait on schema/auth startup work.
app.get("/health", (c) => c.json(buildHealthPayload()));

// CORS middleware - validates origin against allowlist
const allowedPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  // Same Wi‑Fi: iPad / phone testing against a machine IP (Expo, Safari, etc.)
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  // Firebase Hosting default hosts (enterprise web on *.web.app / *.firebaseapp.com)
  /^https:\/\/[a-z0-9][a-z0-9-]*[a-z0-9]\.web\.app$/i,
  /^https:\/\/[a-z0-9][a-z0-9-]*[a-z0-9]\.firebaseapp\.com$/i,
  // Production enterprise web (add more custom domains via CORS_ALLOWED_ORIGINS)
  /^https:\/\/(www\.)?alenio\.app$/i,
];
const extraOrigins = (env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string): boolean {
  if (extraOrigins.includes(origin)) return true;
  return allowedPatterns.some((re) => re.test(origin));
}

app.use(
  "*",
  cors({
    origin: (origin) => (origin && isOriginAllowed(origin) ? origin : null),
    credentials: true,
  })
);

// Logging
app.use("*", logger());

async function waitForStartupSchema(c: { req: { path: string } }, next: () => Promise<void>) {
  if (isFastPublicPath(c.req.path)) {
    await next();
    return;
  }
  await startupSchemaReady;
  await next();
}

// Ensure dev-only schema patches before API traffic (prod uses Railway preDeploy db push).
app.use("/api/*", waitForStartupSchema);
app.use("/web/*", waitForStartupSchema);
app.use("/admin/*", waitForStartupSchema);

// Stripe webhooks need the raw body for signature verification (must run before JSON parsers on this path only — no global body parser).
app.post("/api/webhooks/stripe", handleStripeWebhook);

// Auth session middleware - populates user/session for all routes
app.use("*", async (c, next) => {
  if (isFastPublicPath(c.req.path)) {
    await next();
    return;
  }
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
    const sessionEmail = session.user.email?.trim() ?? null;
    const synced = await syncAppUserFromNeonAuth(session.user);
    const user = synced?.user ?? null;
    const matchedBy: "auth_user_id" | "email" | "created" | "none" = synced?.matchedBy ?? "none";

    if (!user) {
      console.error(
        "[auth-middleware] Neon session accepted but Prisma user row was not created or found; see [ensure-app-user] logs. authUserId=",
        session.user.id,
        "email=",
        sessionEmail ?? "null",
      );
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

    if (user.email) {
      void redeemPendingInvitesForUser(user.id, user.email).catch((err) => {
        console.error("[auth-middleware] redeemPendingInvitesForUser failed:", err);
      });
    }
  }
  await next();
});

/** Browsers opening the API port directly see a hint (API has no HTML app at `/`). */
app.get("/", (c) => {
  const host = c.req.header("host") ?? `localhost:${env.PORT ?? "3000"}`;
  const hostname = host.replace(/:\d+$/, "");
  const webHintPort = "5173";
  const webUrl = `http://${hostname}:${webHintPort}`;
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Alenio API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 48px auto; padding: 0 20px; color: #0f172a; line-height: 1.5; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    a { color: #4f46e5; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Alenio API</h1>
  <p>This address is the <strong>backend</strong> (JSON API). A blank or empty page here is normal—there is no web UI on this port.</p>
  <p>Open the <strong>web app</strong> (Vite dev server, usually port <code>${webHintPort}</code>):</p>
  <p><a href="${webUrl}">${webUrl}</a></p>
  <p style="color:#64748b;font-size:14px">Health: <a href="/health">/health</a></p>
</body>
</html>`);
});

/** Explicit Neon Auth → Prisma user sync (middleware already runs sync; this is for the mobile app right after sign-up / verify). */
app.post("/api/auth/sync-user", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const debug = c.get("authDebug");
  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, image: user.image },
    matchedBy: debug?.matchedBy ?? null,
  });
});

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

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function fileFromBase64Json(payload: {
  data?: unknown;
  filename?: unknown;
  contentType?: unknown;
}): File | null {
  if (typeof payload.data !== "string" || !payload.data.trim()) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload.data, "base64");
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) return null;
  const name = String(payload.filename ?? "photo.jpg").trim() || "photo.jpg";
  const type = String(payload.contentType ?? "image/jpeg").trim() || "image/jpeg";
  return new File([bytes], name, { type });
}

type UploadParseResult =
  | { ok: true; file: File; purpose: "profile" | "team" | "generic"; teamId: string }
  | { ok: false; status: 400 | 413; message: string; code: string };

type UploadContext = {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    parseBody: () => Promise<Record<string, string | File>>;
  };
};

function friendlyMultipartError(detail: string): string {
  if (/boundary|mime type|form data|multipart/i.test(detail)) {
    return "Upload format was not recognized. Please update the app and try again.";
  }
  return detail ? `Could not read upload. (${detail})` : "Could not read upload.";
}

async function parseJsonBase64Upload(c: UploadContext): Promise<UploadParseResult> {
  let json: {
    purpose?: string;
    teamId?: string;
    data?: string;
    filename?: string;
    contentType?: string;
  };
  try {
    json = (await c.req.json()) as typeof json;
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Invalid photo upload. Try selecting the image again.",
      code: "VALIDATION_ERROR",
    };
  }

  const purposeRaw = String(json.purpose ?? "").trim();
  const teamIdRaw = String(json.teamId ?? "").trim();
  const file = fileFromBase64Json(json);
  if (!file) {
    const tooLarge =
      typeof json.data === "string" && Math.floor(json.data.length * 0.75) > MAX_UPLOAD_BYTES;
    return {
      ok: false,
      status: tooLarge ? 413 : 400,
      message: tooLarge
        ? "Photo is too large. Choose a smaller image."
        : "Invalid image data. Try selecting the photo again.",
      code: tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR",
    };
  }

  const purpose = purposeRaw === "profile" || purposeRaw === "team" ? purposeRaw : "generic";
  return { ok: true, file, purpose, teamId: teamIdRaw };
}

async function parseMultipartUpload(c: UploadContext): Promise<UploadParseResult> {
  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch (parseErr) {
    const detail = parseErr instanceof Error ? parseErr.message : "Invalid multipart body";
    return {
      ok: false,
      status: 400,
      message: friendlyMultipartError(detail),
      code: "VALIDATION_ERROR",
    };
  }

  const raw = body["file"];
  if (!(raw instanceof File)) {
    return { ok: false, status: 400, message: "No file provided", code: "VALIDATION_ERROR" };
  }
  if (raw.size === 0) {
    return {
      ok: false,
      status: 400,
      message: "Uploaded file is empty. Try selecting the photo again.",
      code: "VALIDATION_ERROR",
    };
  }

  const purposeRaw = body["purpose"] != null ? String(body["purpose"]).trim() : "";
  const teamIdRaw = body["teamId"] != null ? String(body["teamId"]).trim() : "";
  const purpose = purposeRaw === "profile" || purposeRaw === "team" ? purposeRaw : "generic";
  return { ok: true, file: raw, purpose, teamId: teamIdRaw };
}

async function resolveUploadFile(c: UploadContext, mode: "json" | "multipart" | "auto"): Promise<UploadParseResult> {
  if (mode === "json") return parseJsonBase64Upload(c);
  if (mode === "multipart") return parseMultipartUpload(c);

  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  const uploadFormat = (c.req.header("x-alenio-upload") ?? "").toLowerCase();
  if (uploadFormat === "base64" || uploadFormat === "json") {
    return parseJsonBase64Upload(c);
  }
  if (contentType.includes("multipart/form-data")) {
    return parseMultipartUpload(c);
  }
  return parseJsonBase64Upload(c);
}

async function handleFileUpload(c: {
  get: (key: "user") => AppUser | null;
  json: (data: unknown, status?: number) => Response;
  req: UploadContext["req"];
}, mode: "json" | "multipart" | "auto") {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!isFirebaseStorageConfigured()) {
    return c.json({
      error: {
        message: "File storage is not configured yet. Add Firebase Storage env vars on backend.",
        code: "STORAGE_NOT_CONFIGURED",
      },
    }, 503);
  }

  try {
    const resolved = await resolveUploadFile(c, mode);
    if (!resolved.ok) {
      return c.json({ error: { message: resolved.message, code: resolved.code } }, resolved.status);
    }
    const { file, purpose, teamId: teamIdRaw } = resolved;
    if (purpose === "team" && !teamIdRaw) {
      return c.json(
        { error: { message: "teamId is required for team photo uploads", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    if (purpose === "team" && teamIdRaw) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: user.id, teamId: teamIdRaw } },
      });
      if (!membership || !["owner", "team_leader"].includes(membership.role)) {
        return c.json({ error: { message: "Only team owners can change the team photo", code: "FORBIDDEN" } }, 403);
      }
      const team = await prisma.team.findUnique({
        where: { id: teamIdRaw },
        select: { image: true },
      });
      await deleteStorageObjectByUrlIfOwned(team?.image ?? undefined);
      const uploaded = await uploadFileToFirebaseStorage({
        userId: user.id,
        file,
        slot: "team",
        teamId: teamIdRaw,
      });
      return c.json({ data: uploaded });
    }

    if (purpose === "profile") {
      const row = await prisma.user.findUnique({
        where: { id: user.id },
        select: { image: true },
      });
      await deleteStorageObjectByUrlIfOwned(row?.image ?? undefined);
      const uploaded = await uploadFileToFirebaseStorage({
        userId: user.id,
        file,
        slot: "profile",
      });
      return c.json({ data: uploaded });
    }

    const uploaded = await uploadFileToFirebaseStorage({
      userId: user.id,
      file,
    });
    return c.json({ data: uploaded });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Upload failed";
    const message = /boundary|mime type|form data|multipart/i.test(raw)
      ? "Upload format was not recognized. Please update the app and try again."
      : raw;
    return c.json({ error: { message, code: "UPLOAD_ERROR" } }, 500);
  }
}

// Mobile app: JSON + base64 (never multipart)
app.post("/api/upload/json", async (c) => handleFileUpload(c, "json"));

// Web / browser: multipart form-data
app.post("/api/upload", async (c) => handleFileUpload(c, "auto"));

// Upload smoke test - verifies Firebase upload wiring end-to-end
app.post("/api/upload/smoke", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!isFirebaseStorageConfigured()) {
    return c.json({
      error: {
        message: "File storage is not configured yet. Add Firebase Storage env vars on backend.",
        code: "STORAGE_NOT_CONFIGURED",
      },
    }, 503);
  }

  try {
    const content = `upload-smoke-test ${new Date().toISOString()} user=${user.id}`;
    const file = new File([content], "upload-smoke-test.txt", { type: "text/plain" });
    const uploaded = await uploadFileToFirebaseStorage({
      userId: user.id,
      file,
    });
    return c.json({
      data: {
        ok: true,
        provider: "firebase",
        uploaded,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload smoke test failed";
    return c.json({
      error: {
        message,
        code: "UPLOAD_SMOKE_TEST_FAILED",
      },
    }, 500);
  }
});

// Update profile (name and/or image)
app.patch("/api/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name, image, timezone } = body;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(timezone !== undefined
        ? { timezone: typeof timezone === "string" && isValidTimeZone(timezone) ? timezone : null }
        : {}),
    },
    select: { id: true, name: true, email: true, image: true, timezone: true },
  });

  return c.json({ data: updated });
});

app.post("/api/profile/email-change/request", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const newEmail = normalizeEmailInput(body.newEmail);
  if (!newEmail) {
    return c.json({ error: { message: "Enter a valid email address.", code: "INVALID_EMAIL" } }, 400);
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!fullUser) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);

  try {
    await requestEmailChange(user.id, fullUser.email, newEmail);
    return c.json({ data: { ok: true, email: newEmail } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send verification code.";
    return c.json({ error: { message, code: "EMAIL_CHANGE_REQUEST_FAILED" } }, 400);
  }
});

app.post("/api/profile/email-change/confirm", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const newEmail = normalizeEmailInput(body.newEmail);
  const otp = typeof body.otp === "string" ? body.otp.replace(/\D/g, "") : "";
  if (!newEmail) {
    return c.json({ error: { message: "Enter a valid email address.", code: "INVALID_EMAIL" } }, 400);
  }
  if (otp.length < 6) {
    return c.json({ error: { message: "Enter the full verification code.", code: "INVALID_OTP" } }, 400);
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!fullUser) return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);

  try {
    const updated = await confirmEmailChange(user.id, fullUser.email, newEmail, otp);
    return c.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update email.";
    return c.json({ error: { message, code: "EMAIL_CHANGE_CONFIRM_FAILED" } }, 400);
  }
});

// Get current user profile with admin flag
app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, image: true, isAdmin: true, timezone: true },
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

  try {
    await deleteAppUserCompletely(user.id);
  } catch (err) {
    console.error("[delete-account] failed for user", user.id, err);
    return c.json(
      { error: { message: "Could not delete account. Try again or contact support.", code: "DELETE_FAILED" } },
      500,
    );
  }

  return c.json({ data: { deleted: true } });
});

// Routes
app.route("/api/calendar-connections", calendarConnectionsRouter);
app.route("/api/sample", sampleRouter);
app.route("/api/users", usersRouter);
app.route("/api/check-in-template-library", checkInTemplateLibraryRouter);
app.route("/api/teams/:teamId/members/me", goLeaderPinRouter);
app.route("/api/teams/:teamId/one-on-one-templates", oneOnOneTemplatesRouter);
app.route("/api/teams/:teamId/members", oneOnOneMeetingsRouter);
app.route("/api/teams/:teamId/members", developmentGoalsRouter);
app.route("/api/teams/:teamId/members", senecaRouter);
app.route("/api/teams/:teamId/seneca", senecaTeamRouter);
app.route("/api/teams/:teamId/tasks", tasksRouter);
app.route("/api/teams/:teamId/messages", messagesRouter);
app.route("/api/teams/:teamId/templates", templatesRouter);
app.route("/api/teams/:teamId/subscription", subscriptionRouter);
app.route("/api/teams/:teamId/checklist-locations", checklistLocationsRouter);
app.route("/api/teams/:teamId/walks", walksRouter);
app.route("/api/teams/:teamId/temp-checks", tempChecksRouter);
app.route("/api/teams", teamsRouter);
app.route("/api/public/checklist-hubs", publicChecklistHubsRouter);
app.route("/api/public/checklist-locations", publicChecklistLocationsRouter);
app.route("/api/public/go", publicGoLinkRouter);
app.route("/api/team-invites", teamInvitesPublicRouter);
app.route("/api/tasks/mine", myTasksRouter);
app.route("/api/dms", dmsRouter);
app.route("/api/join-requests", joinRequestsRouter);
app.route("/api/teams", calendarRouter);
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
// Deletes old calendar events and completed tasks past retention windows.
async function runCleanup() {
  const eventsCutoff = new Date();
  eventsCutoff.setDate(eventsCutoff.getDate() - 45);
  const completedTasksCutoff = new Date();
  completedTasksCutoff.setMonth(completedTasksCutoff.getMonth() - 7);

  try {
    // Delete calendar events whose start date is older than 45 days.
    const deletedEvents = await prisma.calendarEvent.deleteMany({
      where: { startDate: { lt: eventsCutoff } },
    });

    // Delete only completed tasks older than 7 months.
    // This keeps active/in-progress tasks intact and preserves short-term history.
    const deletedTasks = await prisma.task.deleteMany({
      where: {
        status: "done",
        completedAt: { not: null, lt: completedTasksCutoff },
      },
    });

    if (deletedEvents.count > 0 || deletedTasks.count > 0) {
      console.log(`[cleanup] Removed ${deletedEvents.count} events >45d and ${deletedTasks.count} completed tasks >7mo`);
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

console.log(
  senecaAvailable()
    ? "✅ Seneca coaching assistant enabled"
    : `⚠️ Seneca disabled — OPENAI_API_KEY missing or invalid (present=${senecaDiagnostics().present}, length=${senecaDiagnostics().length}, openAiRelatedEnvKeyNames=${JSON.stringify(senecaDiagnostics().openAiRelatedEnvKeyNames)}, railwayService=${senecaDiagnostics().railwayService ?? "n/a"})`,
);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
  maxRequestBodySize: 50 * 1024 * 1024,
};
