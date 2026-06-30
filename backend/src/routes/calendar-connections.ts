import { Hono } from "hono";
import { prisma } from "../prisma";
import { encryptSecret } from "../lib/calendar-token-crypto";
import {
  buildMicrosoftAuthorizeUrl,
  createMicrosoftOAuthState,
  decodeState,
  exchangeMicrosoftCode,
  fetchMicrosoftCalendars,
  fetchMicrosoftProfile,
  isMicrosoftCalendarConfigured,
  successRedirectUrl,
  type OAuthPlatform,
} from "../lib/microsoft-calendar";
import {
  pickDefaultMicrosoftCalendar,
  serializeCalendarConnection,
  syncOutlookConnection,
  syncOutlookForUserIfStale,
} from "../lib/sync-outlook-calendar";
import { formatOutlookUserError } from "../lib/calendar-oauth-errors";

type Variables = {
  user: { id: string; email: string | null; name: string | null; image?: string | null } | null;
};

export const calendarConnectionsRouter = new Hono<{ Variables: Variables }>();

function requireUser(c: { get: (key: "user") => Variables["user"] }) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

calendarConnectionsRouter.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const rows = await prisma.calendarConnection.findMany({
    where: { userId: user.id },
    orderBy: { provider: "asc" },
  });
  return c.json({
    data: {
      configured: isMicrosoftCalendarConfigured(),
      connections: rows.map(serializeCalendarConnection),
    },
  });
});

calendarConnectionsRouter.get("/microsoft/start", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!isMicrosoftCalendarConfigured()) {
    return c.json({ error: { message: "Outlook calendar sync is not configured yet.", code: "NOT_CONFIGURED" } }, 503);
  }

  const platformRaw = c.req.query("platform") === "mobile" ? "mobile" : "web";
  const platform = platformRaw as OAuthPlatform;
  const state = createMicrosoftOAuthState(user.id, platform);
  const url = buildMicrosoftAuthorizeUrl(state);
  return c.json({ data: { url } });
});

calendarConnectionsRouter.get("/microsoft/callback", async (c) => {
  if (!isMicrosoftCalendarConfigured()) {
    return c.text("Outlook calendar sync is not configured.", 503);
  }

  const code = c.req.query("code");
  const stateRaw = c.req.query("state");
  const oauthError = c.req.query("error_description") || c.req.query("error");
  const state = stateRaw ? decodeState(stateRaw) : null;
  const platform: OAuthPlatform = state?.platform ?? "web";

  if (oauthError || !code || !state) {
    const friendly = formatOutlookUserError(oauthError || "Authorization was cancelled.");
    return c.redirect(successRedirectUrl(platform, "error", friendly));
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const profile = await fetchMicrosoftProfile(tokens.access_token);
    const accountEmail = profile.mail?.trim() || profile.userPrincipalName?.trim() || null;
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    const connection = await prisma.calendarConnection.upsert({
      where: { userId_provider: { userId: state.userId, provider: "microsoft" } },
      create: {
        userId: state.userId,
        provider: "microsoft",
        accountEmail,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token!),
        accessTokenExpiresAt: expiresAt,
      },
      update: {
        accountEmail,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token!),
        accessTokenExpiresAt: expiresAt,
        syncError: null,
      },
    });

    await pickDefaultMicrosoftCalendar(connection.id, tokens.access_token);
    await syncOutlookConnection(connection.id);

    return c.redirect(successRedirectUrl(platform, "connected"));
  } catch (err) {
    const message = formatOutlookUserError(err instanceof Error ? err.message : "Could not connect Outlook");
    return c.redirect(successRedirectUrl(platform, "error", message));
  }
});

calendarConnectionsRouter.get("/microsoft/calendars", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const connection = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "microsoft" } },
  });
  if (!connection) return c.json({ error: { message: "Outlook is not connected", code: "NOT_FOUND" } }, 404);

  const { decryptSecret } = await import("../lib/calendar-token-crypto");
  const { refreshMicrosoftAccessToken } = await import("../lib/microsoft-calendar");
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const tokens = await refreshMicrosoftAccessToken(refreshToken);
  const calendars = await fetchMicrosoftCalendars(tokens.access_token);
  return c.json({ data: calendars });
});

calendarConnectionsRouter.patch("/microsoft", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const calendarId = typeof body.calendarId === "string" ? body.calendarId.trim() : "";
  const calendarName = typeof body.calendarName === "string" ? body.calendarName.trim() : "";
  if (!calendarId) return c.json({ error: { message: "calendarId is required", code: "INVALID" } }, 400);

  const connection = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "microsoft" } },
  });
  if (!connection) return c.json({ error: { message: "Outlook is not connected", code: "NOT_FOUND" } }, 404);

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      externalCalendarId: calendarId,
      externalCalendarName: calendarName || connection.externalCalendarName,
    },
  });
  const synced = await syncOutlookConnection(connection.id);
  return c.json({ data: synced });
});

calendarConnectionsRouter.post("/microsoft/sync", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const connection = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "microsoft" } },
  });
  if (!connection) return c.json({ error: { message: "Outlook is not connected", code: "NOT_FOUND" } }, 404);

  const synced = await syncOutlookConnection(connection.id);
  return c.json({ data: synced });
});

calendarConnectionsRouter.delete("/microsoft", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  await prisma.calendarConnection.deleteMany({
    where: { userId: user.id, provider: "microsoft" },
  });
  return c.json({ data: { ok: true } });
});

calendarConnectionsRouter.get("/external-events", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  await syncOutlookForUserIfStale(user.id);

  const startRaw = c.req.query("start");
  const endRaw = c.req.query("end");
  const start = startRaw ? new Date(startRaw) : new Date(new Date().setDate(new Date().getDate() - 14));
  const end = endRaw ? new Date(endRaw) : new Date(new Date().setDate(new Date().getDate() + 90));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return c.json({ error: { message: "Invalid date range", code: "INVALID" } }, 400);
  }

  const events = await prisma.externalCalendarEvent.findMany({
    where: {
      userId: user.id,
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    orderBy: { startDate: "asc" },
  });

  return c.json({
    data: events.map((event) => ({
      id: event.id,
      provider: "microsoft",
      title: event.titleDisplay,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate?.toISOString() ?? null,
      allDay: event.allDay,
      isExternal: true,
      isPrivate: true,
    })),
  });
});
