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

function outlookEventTitle(subject?: string | null): string {
  const trimmed = subject?.trim();
  return trimmed || "Untitled event";
}

function syncWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - SYNC_PAST_DAYS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + SYNC_FUTURE_DAYS);
  return { start, end };
}

function parseAllDayGraphDate(value?: string): Date | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  // Noon UTC keeps the calendar day stable across user timezones.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseTimedGraphDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isGraphAllDayEvent(event: {
  isAllDay?: boolean;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
}): boolean {
  if (event.isAllDay === true) return true;
  const startRaw = event.start?.dateTime;
  const endRaw = event.end?.dateTime;
  if (!startRaw || !endRaw) return false;
  if (!/T00:00:00/.test(startRaw) || !/T00:00:00/.test(endRaw)) return false;
  return startRaw.slice(0, 10) !== endRaw.slice(0, 10);
}

/** Graph all-day end dates are exclusive (midnight after the last day). */
function normalizeOutlookEventDates(
  startRaw?: string,
  endRaw?: string | null,
  isAllDay?: boolean,
): { startDate: Date; endDate: Date | null; allDay: boolean } | null {
  const allDay = Boolean(isAllDay);
  if (allDay) {
    const startDate = parseAllDayGraphDate(startRaw);
    if (!startDate) return null;
    if (!endRaw) return { startDate, endDate: null, allDay: true };
    let endDate = parseAllDayGraphDate(endRaw);
    if (!endDate) return { startDate, endDate: null, allDay: true };
    endDate = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() - 1, 12, 0, 0),
    );
    if (endDate < startDate) endDate = startDate;
    return { startDate, endDate, allDay: true };
  }

  const startDate = parseTimedGraphDate(startRaw);
  if (!startDate) return null;
  const endDate = endRaw ? parseTimedGraphDate(endRaw) : null;
  return { startDate, endDate, allDay: false };
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
      const allDay = isGraphAllDayEvent(event);
      const normalized = normalizeOutlookEventDates(event.start?.dateTime, event.end?.dateTime, allDay);
      if (!normalized) continue;
      const { startDate, endDate } = normalized;
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
          allDay: normalized.allDay,
          titleDisplay: outlookEventTitle(event.subject),
        },
        update: {
          startDate,
          endDate,
          allDay: normalized.allDay,
          titleDisplay: outlookEventTitle(event.subject),
        },
      });
    }

    await prisma.externalCalendarEvent.deleteMany({
      where: {
        connectionId: connection.id,
        ...(seen.size > 0 ? { externalEventId: { notIn: [...seen] } } : {}),
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
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
