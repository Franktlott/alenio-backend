import type { CalendarConnection } from "@prisma/client";
import { decryptSecret, encryptSecret } from "./calendar-token-crypto";
import {
  fetchMicrosoftCalendarView,
  fetchMicrosoftCalendars,
  refreshMicrosoftAccessToken,
} from "./microsoft-calendar";
import { prisma } from "../prisma";
import { formatOutlookUserError } from "./calendar-oauth-errors";

const SYNC_PAST_DAYS = 14;
const SYNC_FUTURE_DAYS = 90;
const STALE_SYNC_MS = 15 * 60 * 1000;

function syncWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - SYNC_PAST_DAYS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + SYNC_FUTURE_DAYS);
  return { start, end };
}

function parseGraphDate(value?: string, isAllDay?: boolean): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (isAllDay) {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export type CalendarConnectionPublic = {
  id: string;
  provider: string;
  accountEmail: string | null;
  externalCalendarId: string | null;
  externalCalendarName: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  connected: boolean;
};

export function serializeCalendarConnection(row: CalendarConnection): CalendarConnectionPublic {
  return {
    id: row.id,
    provider: row.provider,
    accountEmail: row.accountEmail,
    externalCalendarId: row.externalCalendarId,
    externalCalendarName: row.externalCalendarName,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    syncError: row.syncError ? formatOutlookUserError(row.syncError) : null,
    connected: Boolean(row.refreshTokenEnc),
  };
}

async function getValidAccessToken(connection: CalendarConnection): Promise<string> {
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
  const accessEnc = connection.accessTokenEnc;
  if (accessEnc && expiresAt > Date.now() + 60_000) {
    return decryptSecret(accessEnc);
  }
  const tokens = await refreshMicrosoftAccessToken(refreshToken);
  const accessToken = tokens.access_token;
  const nextRefresh = tokens.refresh_token ?? refreshToken;
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptSecret(accessToken),
      refreshTokenEnc: encryptSecret(nextRefresh),
      accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    },
  });
  return accessToken;
}

export async function syncOutlookConnection(connectionId: string): Promise<CalendarConnectionPublic> {
  const connection = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.provider !== "microsoft") {
    throw new Error("Outlook connection not found");
  }
  if (!connection.externalCalendarId) {
    throw new Error("No Outlook calendar selected");
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const { start, end } = syncWindow();
    const events = await fetchMicrosoftCalendarView(
      accessToken,
      connection.externalCalendarId,
      start.toISOString(),
      end.toISOString(),
    );

    const seen = new Set<string>();
    for (const event of events) {
      if (!event.id) continue;
      if (event.showAs === "free") continue;
      const startDate = parseGraphDate(event.start?.dateTime, event.isAllDay);
      if (!startDate) continue;
      const endDate = parseGraphDate(event.end?.dateTime, event.isAllDay);
      seen.add(event.id);
      await prisma.externalCalendarEvent.upsert({
        where: {
          connectionId_externalEventId: {
            connectionId: connection.id,
            externalEventId: event.id,
          },
        },
        create: {
          userId: connection.userId,
          connectionId: connection.id,
          externalEventId: event.id,
          startDate,
          endDate,
          allDay: Boolean(event.isAllDay),
          titleDisplay: "Busy",
        },
        update: {
          startDate,
          endDate,
          allDay: Boolean(event.isAllDay),
          titleDisplay: "Busy",
        },
      });
    }

    await prisma.externalCalendarEvent.deleteMany({
      where: {
        connectionId: connection.id,
        startDate: { gte: start, lte: end },
        ...(seen.size > 0 ? { externalEventId: { notIn: [...seen] } } : {}),
      },
    });

    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date(), syncError: null },
    });
    return serializeCalendarConnection(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Outlook sync failed";
    const updated = await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { syncError: message },
    });
    return serializeCalendarConnection(updated);
  }
}

export async function syncOutlookForUserIfStale(userId: string): Promise<void> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "microsoft" } },
  });
  if (!connection?.externalCalendarId) return;
  const last = connection.lastSyncedAt?.getTime() ?? 0;
  if (Date.now() - last < STALE_SYNC_MS) return;
  await syncOutlookConnection(connection.id);
}

export async function pickDefaultMicrosoftCalendar(connectionId: string, accessToken: string): Promise<void> {
  const calendars = await fetchMicrosoftCalendars(accessToken);
  const chosen = calendars.find((c) => c.isDefaultCalendar) ?? calendars[0];
  if (!chosen) return;
  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: {
      externalCalendarId: chosen.id,
      externalCalendarName: chosen.name,
    },
  });
}
