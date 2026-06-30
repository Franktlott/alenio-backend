import { useEffect, useState } from "react";
import {
  disconnectMicrosoftCalendar,
  fetchCalendarConnections,
  startMicrosoftCalendarConnect,
  syncMicrosoftCalendar,
  type CalendarConnectionSummary,
} from "../lib/outlook-calendar-api";

type Props = {
  onStatusChange?: () => void;
};

export function OutlookCalendarPanel({ onStatusChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionSummary | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalendarConnections();
      setConfigured(data.configured);
      setConnection(data.connections.find((c) => c.provider === "microsoft") ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load calendar settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await startMicrosoftCalendarConnect("web");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Outlook connection.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Outlook from Alenio?")) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectMicrosoftCalendar();
      await load();
      onStatusChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Outlook.");
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
      setError(e instanceof Error ? e.message : "Could not sync Outlook.");
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
            {connection.externalCalendarName ? ` · ${connection.externalCalendarName}` : ""}
          </p>
          {connection.lastSyncedAt ? (
            <p className="enterprise-muted enterprise-outlook-panel-meta">
              Last synced {new Date(connection.lastSyncedAt).toLocaleString()}
            </p>
          ) : null}
          {connection.syncError ? (
            <p className="enterprise-form-error" role="alert">{connection.syncError}</p>
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
      {error ? <p className="enterprise-form-error" role="alert">{error}</p> : null}
    </div>
  );
}
