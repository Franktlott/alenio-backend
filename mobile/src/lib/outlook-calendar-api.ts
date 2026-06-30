import { api } from "./api/api";

export type CalendarConnectionSummary = {
  id: string;
  provider: string;
  accountEmail: string | null;
  externalCalendarId: string | null;
  externalCalendarName: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  connected: boolean;
};

export type ExternalCalendarEventItem = {
  id: string;
  provider: string;
  title: string;
  startDate: string;
  endDate: string | null;
  allDay: boolean;
  isExternal: true;
};

export type MicrosoftOutlookCalendarOption = {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
};

export function fetchCalendarConnections() {
  return api.get<{ configured: boolean; connections: CalendarConnectionSummary[] }>("/api/calendar-connections");
}

export function startMicrosoftCalendarConnect(platform: "web" | "mobile") {
  return api
    .get<{ url: string }>(`/api/calendar-connections/microsoft/start?platform=${platform}`)
    .then((r) => r.url);
}

export function disconnectMicrosoftCalendar() {
  return api.delete<{ ok: true }>("/api/calendar-connections/microsoft");
}

export function syncMicrosoftCalendar() {
  return api.post<CalendarConnectionSummary>("/api/calendar-connections/microsoft/sync", {});
}

export function fetchMicrosoftOutlookCalendars() {
  return api.get<MicrosoftOutlookCalendarOption[]>("/api/calendar-connections/microsoft/calendars");
}

export function updateMicrosoftOutlookCalendar(calendarId: string, calendarName: string) {
  return api.patch<CalendarConnectionSummary>("/api/calendar-connections/microsoft", {
    calendarId,
    calendarName,
  });
}

export function fetchExternalCalendarEvents(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return api.get<ExternalCalendarEventItem[]>(`/api/calendar-connections/external-events${qs ? `?${qs}` : ""}`);
}
