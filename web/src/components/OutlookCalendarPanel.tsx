import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

function OutlookBrandIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="enterprise-outlook-brand-icon">
      <rect x="2" y="6" width="28" height="22" rx="3" fill="#0078D4" />
      <rect x="2" y="6" width="28" height="7" rx="3" fill="#106EBE" />
      <rect x="6" y="17" width="5" height="4" rx="0.75" fill="#fff" opacity="0.95" />
      <rect x="13" y="17" width="13" height="4" rx="0.75" fill="#fff" opacity="0.55" />
      <rect x="6" y="23" width="9" height="2" rx="0.5" fill="#fff" opacity="0.4" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

const OUTLOOK_FEATURES = [
  "Read-only — Alenio never changes Outlook",
  "Private — only you see imported events",
  "Pick one calendar; auto-syncs every 15 min",
] as const;

export function OutlookCalendarPanel({ onStatusChange }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionSummary | null>(null);
  const [calendars, setCalendars] = useState<MicrosoftOutlookCalendarOption[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");

  const refreshOutlookCalendar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["calendar", "external"] });
  };

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
      await refreshOutlookCalendar();
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
      await refreshOutlookCalendar();
      onStatusChange?.();
    } catch (e) {
      setSelectedCalendarId(previous);
      setError(formatOutlookUserError(e instanceof Error ? e.message : "Could not update Outlook calendar."));
    } finally {
      setBusy(false);
    }
  };

  const connected = Boolean(connection?.connected);
  const lastSyncedLabel = connection?.lastSyncedAt
    ? new Date(connection.lastSyncedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="enterprise-outlook-card">
      <div className="enterprise-outlook-card-head">
        <div className="enterprise-outlook-card-brand">
          <div className="enterprise-outlook-card-icon-wrap">
            <OutlookBrandIcon />
          </div>
          <div className="enterprise-outlook-card-head-copy">
            <h2 className="enterprise-outlook-card-title">Microsoft Outlook</h2>
            <p className="enterprise-outlook-card-subtitle">
              {connected
                ? (connection?.accountEmail ?? "Outlook account connected")
                : "Import personal events to your Alenio calendar"}
            </p>
          </div>
        </div>
        {!loading && configured ? (
          <span
            className={`enterprise-outlook-status-pill${connected ? " enterprise-outlook-status-pill--connected" : ""}`}
          >
            {connected ? (
              <>
                <span className="enterprise-outlook-status-dot" aria-hidden />
                Connected
              </>
            ) : (
              "Not connected"
            )}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="enterprise-outlook-card-body enterprise-outlook-card-body--loading">
          <p className="enterprise-muted">Loading calendar settings…</p>
        </div>
      ) : !configured ? (
        <div className="enterprise-outlook-card-body">
          <p className="enterprise-muted">Outlook calendar sync is not enabled on this server yet.</p>
        </div>
      ) : connected ? (
        <div className="enterprise-outlook-card-body">
          <div className="enterprise-outlook-connected-grid">
            <div className="enterprise-outlook-field">
              <span className="enterprise-outlook-field-label">Calendar to sync</span>
              {calendarsLoading ? (
                <span className="enterprise-outlook-field-value enterprise-muted">Loading calendars…</span>
              ) : calendars.length === 0 ? (
                <span className="enterprise-outlook-field-value enterprise-muted">No calendars found</span>
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
            </div>
            <div className="enterprise-outlook-field">
              <span className="enterprise-outlook-field-label">Last synced</span>
              <span className="enterprise-outlook-field-value">{lastSyncedLabel ?? "Not synced yet"}</span>
            </div>
          </div>

          {connection?.syncError ? (
            <OutlookCalendarAlert variant="error" message={formatOutlookUserError(connection.syncError)} />
          ) : null}

          <div className="enterprise-outlook-card-actions">
            <button
              type="button"
              className="enterprise-outlook-btn enterprise-outlook-btn-primary"
              disabled={busy}
              onClick={() => void syncNow()}
            >
              <SyncIcon />
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              className="enterprise-outlook-btn enterprise-outlook-btn-ghost"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="enterprise-outlook-card-body enterprise-outlook-card-body--connect">
          <ul className="enterprise-outlook-feature-list">
            {OUTLOOK_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button
            type="button"
            className="enterprise-outlook-btn enterprise-outlook-btn-microsoft"
            disabled={busy}
            onClick={() => void connect()}
          >
            <OutlookBrandIcon size={18} />
            {busy ? "Opening Microsoft…" : "Connect with Microsoft"}
          </button>
        </div>
      )}

      {error ? <OutlookCalendarAlert variant="error" message={error} /> : null}
    </div>
  );
}
