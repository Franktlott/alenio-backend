import { useCallback, useEffect, useState } from "react";
import {
  disconnectMicrosoftCalendar,
  fetchCalendarConnections,
  fetchMicrosoftOutlookCalendars,
  startMicrosoftCalendarConnect,
  syncMicrosoftCalendar,
  updateMicrosoftOutlookCalendar,
  type CalendarConnectionSummary,
  type MicrosoftOutlookCalendarOption,
} from "../lib/outlook-calendar-api";
import { formatOutlookUserError } from "../lib/outlook-calendar-errors";
import { OutlookCalendarAlert } from "./OutlookCalendarAlert";

type Props = {
  onStatusChange?: () => void;
};

export function OutlookCalendarPanel({ onStatusChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionSummary | null>(null);
  const [calendars, setCalendars] = useState<MicrosoftOutlookCalendarOption[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalendarConnections();
      setConfigured(data.configured);
      setConnection(data.connections.find((c) => c.provider === "microsoft") ?? null);
    } catch (e) {
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not load calendar settings."));
    } finally {
      setLoading(false);
    }
  };

  const loadCalendars = useCallback(async (activeConnection: CalendarConnectionSummary | null) => {
    if (!activeConnection?.connected) {
      setCalendars([]);
      setSelectedCalendarId("");
      return;
    }
    setCalendarsLoading(true);
    try {
      const list = await fetchMicrosoftOutlookCalendars();
      setCalendars(list);
      const current =
        activeConnection.externalCalendarId ??
        list.find((c) => c.isDefaultCalendar)?.id ??
        list[0]?.id ??
        "";
      setSelectedCalendarId(current);
    } catch (e) {
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not load Outlook calendars."));
    } finally {
      setCalendarsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!connection?.connected) return;
    void loadCalendars(connection);
  }, [connection?.connected, connection?.externalCalendarId, loadCalendars]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await startMicrosoftCalendarConnect("web");
      window.location.href = url;
    } catch (e) {
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not start Outlook connection."));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Outlook from Alenio?")) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectMicrosoftCalendar();
      setCalendars([]);
      setSelectedCalendarId("");
      await load();
      onStatusChange?.();
    } catch (e) {
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not disconnect Outlook."));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await syncMicrosoftCalendar();
      setConnection(updated);
      onStatusChange?.();
    } catch (e) {
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not sync Outlook."));
    } finally {
      setBusy(false);
    }
  };

  const onCalendarChange = async (calendarId: string) => {
    const previous = selectedCalendarId;
    setSelectedCalendarId(calendarId);
    const chosen = calendars.find((c) => c.id === calendarId);
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMicrosoftOutlookCalendar(chosen.id, chosen.name);
      setConnection(updated);
      onStatusChange?.();
    } catch (e) {
      setSelectedCalendarId(previous);
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not update Outlook calendar."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="enterprise-muted enterprise-outlook-panel-loading">Loading calendar settings…</p>;
  }

  if (!configured) {
    return (
      <div className="enterprise-outlook-panel">
        <p className="enterprise-muted">Outlook calendar sync is not enabled on this server yet.</p>
      </div>
    );
  }

  return (
    <div className="enterprise-outlook-panel">
      <p className="enterprise-outlook-panel-copy">
        Connect Outlook to see personal busy times on your Alenio calendar. Only you see these blocks — they appear as <strong>Busy</strong>.
      </p>
      {connection?.connected ? (
        <div className="enterprise-outlook-panel-status">
          <span className="enterprise-outlook-connected-badge">Connected</span>
          <p className="enterprise-muted enterprise-outlook-panel-meta">
            {connection.accountEmail ?? "Outlook account"}
          </p>
          <div className="enterprise-outlook-calendar-picker">
            <label className="enterprise-muted enterprise-outlook-calendar-picker-label" htmlFor="outlook-calendar-select">
              Calendar to sync
            </label>
            {calendarsLoading ? (
              <p className="enterprise-muted enterprise-outlook-panel-meta">Loading your Outlook calendars…</p>
            ) : calendars.length === 0 ? (
              <p className="enterprise-muted enterprise-outlook-panel-meta">No Outlook calendars found on this account.</p>
            ) : (
              <select
                id="outlook-calendar-select"
                className="auth-input enterprise-outlook-calendar-select"
                value={selectedCalendarId}
                disabled={busy || calendars.length <= 1}
                onChange={(e) => void onCalendarChange(e.target.value)}
              >
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                    {calendar.isDefaultCalendar ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="enterprise-muted enterprise-outlook-calendar-picker-hint">
              Choose which Outlook calendar Alenio should read for busy times.
            </p>
          </div>
          {connection.lastSyncedAt ? (
            <p className="enterprise-muted enterprise-outlook-panel-meta">
              Last synced {new Date(connection.lastSyncedAt).toLocaleString()}
            </p>
          ) : null}
          {connection.syncError ? (
            <OutlookCalendarAlert variant="error" message={formatOutlookUserError(connection.syncError)} />
          ) : null}
          <div className="enterprise-outlook-panel-actions">
            <button type="button" className="enterprise-team-pill-btn" disabled={busy} onClick={() => void syncNow()}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="enterprise-profile-cancel-btn" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="enterprise-team-pill-btn" disabled={busy} onClick={() => void connect()}>
          {busy ? "Opening Microsoft…" : "Connect Outlook"}
        </button>
      )}
      {error ? <OutlookCalendarAlert variant="error" message={error} /> : null}
    </div>
  );
}
