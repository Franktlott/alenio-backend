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
import { mobileBillingRouter } from "./routes/mobile-billing";
import { activityRouter } from "./routes/activity";
import { userActivityRouter } from "./routes/user-activity";
import { organizationsRouter, ssoPublicRouter } from "./routes/organizations";
import { scimRouter } from "./routes/scim";

import { topicsRouter } from "./routes/topics";
import { adminRouter } from "./routes/admin";
import { adminApiRouter } from "./routes/admin-api";
import { adminSenecaStudioRouter } from "./routes/admin-seneca-studio";
import { webRouter } from "./routes/web-app";
import { handleStripeWebhook } from "./routes/stripe-webhook";
import { pollsRouter } from "./routes/polls";
import { videoRouter } from "./routes/video";
import { usersRouter } from "./routes/users";
import { ogPreviewRouter } from "./routes/og-preview";
import { feedbackRouter } from "./routes/feedback";
import { sendPushNotificationsStrict } from "./lib/push";
import { getDatabasePublicSummary } from "./lib/database-public-summary";
import { isBetterAuthMounted } from "./lib/better-auth-status";
import { syncAppUserFromAuth } from "./lib/ensure-app-user";
import { deleteAppUserCompletely } from "./lib/delete-app-user";
import { assertAccountDeletionAllowed, getAccountDeletionReadiness } from "./lib/account-deletion-readiness";
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
import { ensureCalendarOneOnOneSchema } from "./lib/ensure-calendar-one-on-one-schema";
import { ensureWorkplaceStandardsSchema } from "./lib/ensure-workplace-standards-schema";
import { ensureGoLoginSchema } from "./lib/ensure-go-login-schema";
import { ensureWorkplaceAlertsSchema } from "./lib/ensure-workplace-alerts-schema";
import { ensureGoFrontendSettingsSchema } from "./lib/ensure-go-frontend-settings-schema";
import { ensureGoLeaderPinSchema } from "./lib/ensure-go-leader-pin-schema";
import { ensureWorkspaceModulesSchema } from "./lib/ensure-workspace-modules-schema";
import { ensureSubscriptionCancelSchema } from "./lib/ensure-subscription-cancel-schema";
import { ensureConversationTeamSchema } from "./lib/ensure-conversation-team-schema";
import { ensureGroupParticipantRolesSchema } from "./lib/ensure-group-participant-roles-schema";
import { ensureCalendarConnectionSchema } from "./lib/ensure-calendar-connection-schema";
import { ensureTopicImageSchema } from "./lib/ensure-topic-image-schema";
import { ensureNotificationPreferencesSchema } from "./lib/ensure-notification-preferences-schema";
import { ensurePinnedMessageSchema } from "./lib/ensure-pinned-message-schema";
import { ensureTaskArchiveSchema } from "./lib/ensure-task-archive-schema";
import { ensureWalksSchema } from "./lib/ensure-walks-schema";
import { ensureBetterAuthSchema } from "./lib/ensure-better-auth-schema";
import { ensureOrganizationSchema } from "./lib/ensure-organization-schema";
import { ensureSenecaStudioSchema } from "./lib/ensure-seneca-studio-schema";
import { webPublicBaseUrl } from "./lib/web-public-url";
import { calendarConnectionsRouter } from "./routes/calendar-connections";
import { developmentGoalsRouter } from "./routes/development-goals";
import { senecaRouter } from "./routes/seneca";
import { senecaTeamRouter } from "./routes/seneca-team";
import { senecaStudioRouter } from "./routes/seneca-studio";
import { teamInvitesPublicRouter } from "./routes/team-invites";
import { enterpriseInvitesPublicRouter } from "./routes/enterprise-invites";
import { publicChecklistHubsRouter } from "./routes/public-checklist-hubs";
import { publicGoLinkRouter } from "./routes/public-go-link";
import { publicGoWalksRouter } from "./routes/public-go-walks";
import { walksRouter } from "./routes/walks";
import { isValidTimeZone } from "./lib/timezone";
import { redeemPendingInvitesForUser } from "./lib/team-invites";
import { redeemPendingOrganizationSignupInvitesForUser } from "./lib/enterprise-signup-invite";

const isProduction = env.NODE_ENV === "production";

/** Railway preDeploy already runs `prisma db push`; avoid blocking process start in prod. */
if (!isProduction) {
  syncPrismaSchemaOnStartup();
}

/** Dev safety net + prod fallback when preDeploy db push missed a table. */
const startupSchemaReady = Promise.all([
  ensureBetterAuthSchema(prisma),
  ensureOrganizationSchema(prisma),
  ensureSenecaStudioSchema(prisma),
  ...(isProduction
    ? [ensureGoLoginSchema(prisma), ensureWorkplaceAlertsSchema(prisma), ensureGoFrontendSettingsSchema(prisma), ensureGoLeaderPinSchema(prisma), ensureWorkspaceModulesSchema(prisma), ensureWalksSchema(prisma), ensureSubscriptionCancelSchema(prisma), ensureConversationTeamSchema(prisma), ensureGroupParticipantRolesSchema(prisma), ensureCalendarOneOnOneSchema(prisma), ensureTopicImageSchema(prisma), ensureNotificationPreferencesSchema(prisma), ensurePinnedMessageSchema(prisma), ensureTaskArchiveSchema(prisma)]
    : [
        ensureOneOnOneSchema(prisma),
        ensureDevelopmentPlanSchema(prisma),
        ensureTeamInviteSchema(prisma),
        ensureRecurrenceSeriesSchema(prisma),
        ensureUserTimezoneSchema(prisma),
        ensureCalendarApprovalSchema(prisma),
        ensureCalendarOneOnOneSchema(prisma),
        ensureWorkplaceStandardsSchema(prisma),
        ensureCalendarConnectionSchema(prisma),
        ensureGoLoginSchema(prisma),
        ensureWorkplaceAlertsSchema(prisma),
        ensureGoFrontendSettingsSchema(prisma),
        ensureGoLeaderPinSchema(prisma),
        ensureWorkspaceModulesSchema(prisma),
        ensureWalksSchema(prisma),
        ensureSubscriptionCancelSchema(prisma),
        ensureConversationTeamSchema(prisma),
        ensureGroupParticipantRolesSchema(prisma),
        ensureTopicImageSchema(prisma),
        ensureNotificationPreferencesSchema(prisma),
        ensurePinnedMessageSchema(prisma),
        ensureTaskArchiveSchema(prisma),
      ]),
]);

function isFastPublicPath(path: string): boolean {
  return path === "/health";
}

function buildHealthPayload() {
  return {
    status: "ok",
    database: getDatabasePublicSummary(),
    buildMarker: env.BACKEND_BUILD_MARKER,
    storageProvider: "firebase",
    storageConfigured: isFirebaseStorageConfigured(),
    senecaConfigured: senecaAvailable(),
    senecaDiagnostics: senecaDiagnostics(),
    /** Secret present (32+ chars) — Better Auth can turn on after boot. */
    betterAuthConfigured: (env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 32,
    /** Routes mounted successfully after deferred init. */
    betterAuthEnabled: isBetterAuthMounted(),
    /** API accepts Better Auth bearer sessions only (legacy Neon JWT fallback removed). */
    betterAuthSessionVerify: isBetterAuthMounted(),
    /** Microsoft Entra social sign-in configured (MICROSOFT_CLIENT_ID + SECRET). */
    microsoftSignInConfigured: !!(
      env.MICROSOFT_CLIENT_ID?.trim() && env.MICROSOFT_CLIENT_SECRET?.trim()
    ),
    /** Resend API key present — OTP, invites, and feedback emails can send. */
    emailConfigured: !!(env.RESEND_API_KEY?.trim()),
    /** Public From address used by Resend (domain must be verified in Resend). */
    emailFrom: env.FROM_EMAIL?.trim() || "noreply@alenio.com",
  };
}

type Variables = {
  user: AppUser | null;
  session: AppSession | null;
  authDebug: {
    authUserFound: boolean;
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

/** Diagnostics + force-sync for Walk Builder tables (public schema). */
app.get("/api/walks-schema-check", async (c) => {
  await startupSchemaReady;
  const ensure = await ensureWalksSchema(prisma);
  return c.json({
    buildMarker: env.BACKEND_BUILD_MARKER,
    ensure,
  });
});

/** Diagnostics: neon_auth schema tables readable for Better Auth? */
app.get("/api/auth-schema-check", async (c) => {
  const ensure = await ensureBetterAuthSchema(prisma);
  const out: Record<string, unknown> = {
    buildMarker: env.BACKEND_BUILD_MARKER,
    betterAuthMounted: isBetterAuthMounted(),
    ensure,
  };
  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'neon_auth'
      ORDER BY table_name
    `;
    out.tables = tables.map((t) => t.table_name);
  } catch (err) {
    out.tablesError = err instanceof Error ? err.message : String(err);
  }
  try {
    const users = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM neon_auth."user"
    `;
    out.userCount = users[0]?.n ?? null;
  } catch (err) {
    out.userCountError = err instanceof Error ? err.message : String(err);
  }
  try {
    const sessions = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM neon_auth.session
    `;
    out.sessionCount = sessions[0]?.n ?? null;
  } catch (err) {
    out.sessionCountError = err instanceof Error ? err.message : String(err);
  }
  try {
    const accounts = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM neon_auth.account WHERE "providerId" = 'credential'
    `;
    out.credentialAccountCount = accounts[0]?.n ?? null;
  } catch (err) {
    out.accountCountError = err instanceof Error ? err.message : String(err);
  }
  return c.json(out);
});

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
  /^https:\/\/(www\.)?alenio\.com$/i,
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

app.onError((err, c) => {
  console.error("[hono] unhandled error", c.req.method, c.req.path, err);
  return c.json(
    {
      error: {
        message: "Something went wrong. Please try again.",
        code: "INTERNAL_ERROR",
      },
    },
    500,
  );
});

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
app.use("/scim/*", waitForStartupSchema);

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
      authUserFound: false,
      matchedBy: "none",
      authUserId: null,
      authEmail: null,
      finalAuthenticatedUserId: null,
    });
  } else {
    const sessionEmail = session.user.email?.trim() ?? null;
    const synced = await syncAppUserFromAuth(session.user);
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
        authUserFound: true,
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
      authUserFound: true,
      matchedBy,
      authUserId: session.user.id,
      authEmail: sessionEmail,
      finalAuthenticatedUserId: user.id,
    });

    if (user.email) {
      void redeemPendingInvitesForUser(user.id, user.email).catch((err) => {
        console.error("[auth-middleware] redeemPendingInvitesForUser failed:", err);
      });
      void redeemPendingOrganizationSignupInvitesForUser(user.id, user.email).catch((err) => {
        console.error("[auth-middleware] redeemPendingOrganizationSignupInvitesForUser failed:", err);
      });
    }
  }
  await next();
});

/** Browsers opening the API port directly see a hint (API has no HTML app at `/`). */
app.get("/", (c) => {
  const incoming = new URL(c.req.url);
  const webBase = webPublicBaseUrl();
  const webLogin = `${webBase}/login`;
  const expectedCallback =
    `${env.BACKEND_URL.replace(/\/$/, "")}/api/auth/callback/microsoft`;

  // Entra redirect URI must be the callback path — NOT this homepage.
  // Forwarding code+state here would cause Microsoft `invalid_code` (redirect_uri mismatch).
  if (incoming.searchParams.get("code") || incoming.searchParams.get("error")) {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Microsoft redirect misconfigured</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 20px; color: #0f172a; line-height: 1.5; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; word-break: break-all; }
    a { color: #4f46e5; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Microsoft redirect needs a quick fix</h1>
  <p>Microsoft sent you to the API homepage. In Entra, the <strong>Redirect URI</strong> must be exactly:</p>
  <p><code>${expectedCallback}</code></p>
  <p>Platform type: <strong>Web</strong> (not SPA). Then try again from <a href="${webLogin}">${webLogin}</a>.</p>
</body>
</html>`);
  }

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
  <p>This address is the <strong>backend</strong> (JSON API). There is no login screen here.</p>
  <p>Open the Alenio website:</p>
  <p><a href="${webLogin}">${webLogin}</a></p>
  <p style="color:#64748b;font-size:14px">Health: <a href="/health">/health</a></p>
</body>
</html>`);
});

/** If OAuth lands on the API host's /auth/callback, bounce to the real web app. */
app.get("/auth/callback", (c) => {
  const dest = new URL(`${webPublicBaseUrl()}/auth/callback`);
  const incoming = new URL(c.req.url);
  incoming.searchParams.forEach((value, key) => dest.searchParams.set(key, value));
  return c.redirect(dest.toString(), 302);
});

/** Explicit Better Auth → Prisma user sync (middleware already runs sync; this is for the mobile app right after sign-up / verify). */
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
      <p>Connect. Execute. Elevate.</p>
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
const MAX_ALERT_SOUND_BYTES = 5 * 1024 * 1024;
const ALERT_SOUND_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
]);

type UploadPurpose = "profile" | "team" | "go_alert_sound" | "generic";

function parseUploadPurpose(purposeRaw: string): UploadPurpose {
  if (purposeRaw === "profile" || purposeRaw === "team" || purposeRaw === "go_alert_sound") {
    return purposeRaw;
  }
  return "generic";
}

function isAllowedAlertSoundFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  if (ALERT_SOUND_MIME_TYPES.has(type)) return true;
  return /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name || "");
}

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
  | { ok: true; file: File; purpose: UploadPurpose; teamId: string }
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

  const purpose = parseUploadPurpose(purposeRaw);
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
  const purpose = parseUploadPurpose(purposeRaw);
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
    if (purpose === "go_alert_sound" && !teamIdRaw) {
      return c.json(
        { error: { message: "teamId is required for alert sound uploads", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    if (purpose === "go_alert_sound" && teamIdRaw) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: user.id, teamId: teamIdRaw } },
      });
      if (!membership || !["owner", "team_leader"].includes(membership.role)) {
        return c.json(
          { error: { message: "Only workspace owners and team leaders can upload alert sounds", code: "FORBIDDEN" } },
          403,
        );
      }
      if (!isAllowedAlertSoundFile(file)) {
        return c.json(
          { error: { message: "Upload an MP3, WAV, OGG, or M4A audio file", code: "VALIDATION_ERROR" } },
          400,
        );
      }
      if (file.size > MAX_ALERT_SOUND_BYTES) {
        return c.json(
          { error: { message: "Alert sound must be 5 MB or smaller", code: "PAYLOAD_TOO_LARGE" } },
          413,
        );
      }
      const uploaded = await uploadFileToFirebaseStorage({
        userId: user.id,
        file,
        slot: "go_alert_sound",
        teamId: teamIdRaw,
      });
      return c.json({ data: uploaded });
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
  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, image: true, isAdmin: true, timezone: true },
  });
  return c.json({ data: fullUser });
});

// Debug: confirm auth session + app user row + active database target (non-production only)
app.get("/api/me/debug", async (c) => {
  if ((env.NODE_ENV ?? "").toLowerCase() === "production") {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
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
        authUserFound: authDebug?.authUserFound ?? false,
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
      authUserFound: authDebug?.authUserFound ?? true,
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

// Save push token (legacy endpoint — kept for older clients)
app.post("/api/push-token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({} as { token?: unknown; pushToken?: unknown }));
  const raw = body.pushToken ?? body.token;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return c.json({ error: { message: "Token must be string or null" } }, 400);
  }
  const cleaned = typeof raw === "string" ? raw.trim() : null;
  const next = cleaned && cleaned.length ? cleaned : null;
  try {
    if (next) {
      await prisma.user.updateMany({
        where: { pushToken: next, NOT: { id: user.id } },
        data: { pushToken: null },
      });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { pushToken: next },
      select: { pushToken: true },
    });
    console.log(`[push-token-legacy] saved user=${user.id} hasToken=${!!updated.pushToken}`);
    return c.json({ data: { ok: true, hasToken: !!updated.pushToken } });
  } catch (err) {
    console.error(`[push-token-legacy] failed user=${user.id}:`, err);
    return c.json({ error: { message: "Failed to save push token", code: "PUSH_TOKEN_SAVE_FAILED" } }, 500);
  }
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

// Get notification preferences (alert categories + tone). Does not modify push tokens.
app.get("/api/notification-preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  // Resolve admin flag first so Platform admin UI can render even if preference columns fail.
  const adminRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });
  const isAdmin = adminRow?.isAdmin === true;

  let prefs: {
    isAdmin: boolean;
    notifMessages: boolean;
    notifTaskAssigned: boolean;
    notifTaskDue: boolean;
    notifMeetings: boolean;
    notifAdminUsers: boolean;
    notifAdminWorkspaces: boolean;
    notifAdminBilling: boolean;
    notifTone: string;
    pushToken: string | null;
  } | null = null;

  try {
    prefs = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        isAdmin: true,
        notifMessages: true,
        notifTaskAssigned: true,
        notifTaskDue: true,
        notifMeetings: true,
        notifAdminUsers: true,
        notifAdminWorkspaces: true,
        notifAdminBilling: true,
        notifTone: true,
        pushToken: true,
      },
    });
  } catch (err) {
    console.error("[notification-preferences] preference select failed:", err);
  }

  const notifToneRaw = prefs?.notifTone;
  const notifTone =
    notifToneRaw === "synth" || !notifToneRaw ? "default" : notifToneRaw;

  return c.json({
    data: {
      isAdmin,
      notifMessages: prefs?.notifMessages ?? true,
      notifTaskAssigned: prefs?.notifTaskAssigned ?? true,
      notifTaskDue: prefs?.notifTaskDue ?? true,
      notifMeetings: prefs?.notifMeetings ?? true,
      notifTone,
      hasToken: !!prefs?.pushToken,
      ...(isAdmin
        ? {
            notifAdminUsers: prefs?.notifAdminUsers ?? true,
            notifAdminWorkspaces: prefs?.notifAdminWorkspaces ?? true,
            notifAdminBilling: prefs?.notifAdminBilling ?? true,
          }
        : {}),
    },
  });
});

// Update notification preferences
app.patch("/api/notification-preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json();
  const {
    notifMessages,
    notifTaskAssigned,
    notifTaskDue,
    notifMeetings,
    notifAdminUsers,
    notifAdminWorkspaces,
    notifAdminBilling,
    notifTone,
  } = body;

  const allowedTones = new Set(["default", "bell", "chime", "alert", "silent"]);
  let nextTone: string | undefined;
  if (notifTone !== undefined) {
    const normalized = String(notifTone).trim().toLowerCase();
    if (!allowedTones.has(normalized)) {
      return c.json({ error: { message: "Invalid alert tone", code: "INVALID" } }, 400);
    }
    nextTone = normalized;
  }

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });
  const isAdmin = me?.isAdmin === true;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(notifMessages !== undefined ? { notifMessages } : {}),
      ...(notifTaskAssigned !== undefined ? { notifTaskAssigned } : {}),
      ...(notifTaskDue !== undefined ? { notifTaskDue } : {}),
      ...(notifMeetings !== undefined ? { notifMeetings } : {}),
      ...(nextTone !== undefined ? { notifTone: nextTone } : {}),
      ...(isAdmin && notifAdminUsers !== undefined ? { notifAdminUsers } : {}),
      ...(isAdmin && notifAdminWorkspaces !== undefined ? { notifAdminWorkspaces } : {}),
      ...(isAdmin && notifAdminBilling !== undefined ? { notifAdminBilling } : {}),
    },
    select: {
      isAdmin: true,
      notifMessages: true,
      notifTaskAssigned: true,
      notifTaskDue: true,
      notifMeetings: true,
      notifAdminUsers: true,
      notifAdminWorkspaces: true,
      notifAdminBilling: true,
      notifTone: true,
    },
  });
  const responseTone =
    updated.notifTone === "synth" || !updated.notifTone ? "default" : updated.notifTone;
  return c.json({
    data: {
      isAdmin,
      notifMessages: updated.notifMessages,
      notifTaskAssigned: updated.notifTaskAssigned,
      notifTaskDue: updated.notifTaskDue,
      notifMeetings: updated.notifMeetings,
      notifTone: responseTone,
      ...(isAdmin
        ? {
            notifAdminUsers: updated.notifAdminUsers,
            notifAdminWorkspaces: updated.notifAdminWorkspaces,
            notifAdminBilling: updated.notifAdminBilling,
          }
        : {}),
    },
  });
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

app.get("/api/user/deletion-readiness", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const readiness = await getAccountDeletionReadiness(user.id);
  return c.json({ data: readiness });
});

app.delete("/api/user", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  try {
    await assertAccountDeletionAllowed(user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account cannot be deleted yet.";
    return c.json({ error: { message, code: "DELETION_BLOCKED" } }, 409);
  }

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
app.route("/api/teams/:teamId/walks", walksRouter);
app.route("/api/teams/:teamId/members", oneOnOneMeetingsRouter);
app.route("/api/teams/:teamId/members", developmentGoalsRouter);
app.route("/api/teams/:teamId/members", senecaRouter);
app.route("/api/teams/:teamId/seneca", senecaTeamRouter);
app.route("/api/teams/:teamId/seneca-studio", senecaStudioRouter as any);
app.route("/api/teams/:teamId/tasks", tasksRouter);
app.route("/api/teams/:teamId/messages", messagesRouter);
app.route("/api/teams/:teamId/templates", templatesRouter);
app.route("/api/teams/:teamId/subscription", subscriptionRouter);
app.route("/api/billing", mobileBillingRouter);
app.route("/api/teams", teamsRouter);
app.route("/api/public/checklist-hubs", publicChecklistHubsRouter);
app.route("/api/public/go", publicGoLinkRouter);
app.route("/api/public/go/walks", publicGoWalksRouter);
app.route("/api/team-invites", teamInvitesPublicRouter);
app.route("/api/enterprise-invites", enterpriseInvitesPublicRouter);
app.route("/api/tasks/mine", myTasksRouter);
app.route("/api/dms", dmsRouter);
app.route("/api/join-requests", joinRequestsRouter);
app.route("/api/teams", calendarRouter);
app.route("/api/teams", activityRouter);
app.route("/api/activity", userActivityRouter);
app.route("/api/organizations", organizationsRouter);
app.route("/api/sso", ssoPublicRouter);
app.route("/scim/v2", scimRouter);
app.route("/api/teams", topicsRouter);
app.route("/api/teams", pollsRouter);
app.route("/api/og-preview", ogPreviewRouter);
app.route("/api/feedback", feedbackRouter);
app.route("/api/video", videoRouter);
app.route("/admin", adminRouter);
app.route("/api/admin/seneca-studio", adminSenecaStudioRouter as any);
app.route("/api/admin", adminApiRouter);
app.route("/api/admin-mobile", adminApiRouter);
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

import { handleRealtimeUpgrade, realtimeWebsocket } from "./lib/realtime-ws";

const port = Number(process.env.PORT) || 3000;

console.log(
  senecaAvailable()
    ? "✅ Seneca coaching assistant enabled"
    : `⚠️ Seneca disabled — OPENAI_API_KEY missing or invalid (present=${senecaDiagnostics().present}, length=${senecaDiagnostics().length}, openAiRelatedEnvKeyNames=${JSON.stringify(senecaDiagnostics().openAiRelatedEnvKeyNames)}, railwayService=${senecaDiagnostics().railwayService ?? "n/a"})`,
);

console.log("✅ Realtime messaging WebSocket enabled at /api/realtime");

/** Mount Better Auth after boot so Railway /health is never blocked by auth package init. */
void import("./lib/register-better-auth")
  .then(({ registerBetterAuthRoutes }) => registerBetterAuthRoutes(app))
  .then((enabled) => {
    if (enabled) {
      console.log("[better-auth] ready");
    }
  })
  .catch((err) => {
    console.error("[better-auth] deferred mount failed:", err);
  });

export default {
  port,
  hostname: "0.0.0.0",
  maxRequestBodySize: 50 * 1024 * 1024,
  async fetch(req: Request, server: { upgrade: (req: Request, options: { data: import("./lib/realtime-hub").RealtimeSocketData }) => boolean }) {
    const url = new URL(req.url);
    if (url.pathname === "/api/realtime") {
      return handleRealtimeUpgrade(req, server);
    }
    return app.fetch(req);
  },
  websocket: realtimeWebsocket,
};
