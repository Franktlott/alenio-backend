import { apiDeleteJson, apiGetJson, apiPostJson } from "./api";

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

export function fetchCalendarConnections() {
  return apiGetJson<{
    data: { configured: boolean; connections: CalendarConnectionSummary[] };
  }>("/api/calendar-connections").then((r) => r.data);
}

export function startMicrosoftCalendarConnect(platform: "web" | "mobile") {
  return apiGetJson<{ data: { url: string } }>(
    `/api/calendar-connections/microsoft/start?platform=${platform}`,
  ).then((r) => r.data.url);
}

export function disconnectMicrosoftCalendar() {
  return apiDeleteJson<{ data: { ok: true } }>("/api/calendar-connections/microsoft").then((r) => r.data);
}

export function syncMicrosoftCalendar() {
  return apiPostJson<{ data: CalendarConnectionSummary }>("/api/calendar-connections/microsoft/sync", {}).then(
    (r) => r.data,
  );
}

export function fetchExternalCalendarEvents(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return apiGetJson<{ data: ExternalCalendarEventItem[] }>(
    `/api/calendar-connections/external-events${qs ? `?${qs}` : ""}`,
  ).then((r) => r.data);
}
