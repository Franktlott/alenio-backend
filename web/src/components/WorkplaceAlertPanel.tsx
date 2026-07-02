import { useCallback, useEffect, useState } from "react";
import { fetchTeamGoDevices, postWorkplaceAlert, type GoDeviceRow } from "../lib/api";

type TargetKind = "device" | "all_devices" | "all_users";

type Props = {
  teamId: string;
};

function deviceOptionLabel(d: GoDeviceRow): string {
  const name = d.deviceLabel?.trim() || "Device";
  const suffix = d.source === "active" ? " · active now" : d.source === "approved" ? " · approved" : "";
  return `${name}${suffix} · ${d.deviceId.slice(0, 8)}…`;
}

export function WorkplaceAlertPanel({ teamId }: Props) {
  const [devices, setDevices] = useState<GoDeviceRow[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceLoadError, setDeviceLoadError] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<TargetKind>("all_devices");
  const [deviceId, setDeviceId] = useState("");
  const [title, setTitle] = useState("Workplace alert");
  const [message, setMessage] = useState("");
  const [playSound, setPlaySound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDevices = useCallback(() => {
    setLoadingDevices(true);
    setDeviceLoadError(null);
    return fetchTeamGoDevices(teamId)
      .then((rows) => {
        setDevices(rows);
        setDeviceId((prev) => {
          if (rows.length === 0) return "";
          if (prev && rows.some((r) => r.deviceId === prev)) return prev;
          return rows[0]!.deviceId;
        });
      })
      .catch((err) => {
        setDevices([]);
        setDeviceLoadError(err instanceof Error ? err.message : "Could not load linked devices.");
      })
      .finally(() => {
        setLoadingDevices(false);
      });
  }, [teamId]);

  useEffect(() => {
    void loadDevices();
    const id = window.setInterval(() => void loadDevices(), 30_000);
    return () => window.clearInterval(id);
  }, [loadDevices]);

  async function onPush(e: React.FormEvent) {
    e.preventDefault();
    const body = message.trim();
    if (!body) {
      setError("Enter an alert message.");
      return;
    }
    if (targetKind === "device" && !deviceId) {
      setError("Select a linked device.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await postWorkplaceAlert(teamId, {
        title: title.trim() || "Workplace alert",
        body,
        targetType: targetKind,
        targetDeviceId: targetKind === "device" ? deviceId : undefined,
        playSound,
      });
      setMessage("");
      const targetLabel =
        targetKind === "all_users"
          ? "all workspace users"
          : targetKind === "all_devices"
            ? "all linked devices"
            : "the selected device";
      setSuccess(`Alert sent to ${targetLabel}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send alert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="enterprise-card enterprise-alenio-go-alert" aria-labelledby="workplace-alert-title">
      <header className="enterprise-alenio-go-approvals-head">
        <div>
          <p className="enterprise-alenio-go-kicker">Workplace alert</p>
          <h2 id="workplace-alert-title" className="enterprise-card-title">
            Push alert
          </h2>
          <p className="enterprise-muted enterprise-alenio-go-approvals-sub">
            Send a test alert to a linked Alenio Go device or notify everyone in this workspace.
          </p>
        </div>
      </header>

      <form className="enterprise-alenio-go-alert-form" onSubmit={(e) => void onPush(e)}>
        <label className="enterprise-alenio-go-alert-label" htmlFor="alert-title">
          Title
        </label>
        <input
          id="alert-title"
          className="enterprise-alenio-go-alert-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        <label className="enterprise-alenio-go-alert-label" htmlFor="alert-message">
          Message
        </label>
        <textarea
          id="alert-message"
          className="enterprise-alenio-go-alert-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Front counter needs help"
          required
        />

        <fieldset className="enterprise-alenio-go-alert-targets">
          <legend className="enterprise-alenio-go-alert-label">Send to</legend>
          <label className="enterprise-alenio-go-alert-radio">
            <input
              type="radio"
              name="alert-target"
              checked={targetKind === "device"}
              onChange={() => setTargetKind("device")}
            />
            <span>Workplace device</span>
          </label>
          <label className="enterprise-alenio-go-alert-radio">
            <input
              type="radio"
              name="alert-target"
              checked={targetKind === "all_devices"}
              onChange={() => setTargetKind("all_devices")}
            />
            <span>All linked devices</span>
          </label>
          <label className="enterprise-alenio-go-alert-radio">
            <input
              type="radio"
              name="alert-target"
              checked={targetKind === "all_users"}
              onChange={() => setTargetKind("all_users")}
            />
            <span>All workspace users</span>
          </label>
        </fieldset>

        {targetKind === "device" ? (
          <label className="enterprise-alenio-go-alert-label" htmlFor="alert-device">
            Device
          </label>
        ) : null}
        {targetKind === "device" ? (
          loadingDevices ? (
            <p className="enterprise-muted">Loading devices…</p>
          ) : deviceLoadError ? (
            <p className="enterprise-alenio-go-alert-error" role="alert">
              {deviceLoadError}
            </p>
          ) : devices.length === 0 ? (
            <p className="enterprise-muted">
              No linked devices yet. Open the Alenio Go dashboard on a tablet — it will appear here within a minute.
            </p>
          ) : (
            <select
              id="alert-device"
              className="enterprise-alenio-go-alert-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.deviceId}>
                  {deviceOptionLabel(d)}
                </option>
              ))}
            </select>
          )
        ) : null}

        <label className="enterprise-alenio-go-alert-check">
          <input type="checkbox" checked={playSound} onChange={(e) => setPlaySound(e.target.checked)} />
          <span>Play sound on device (test)</span>
        </label>

        {error ? (
          <p className="enterprise-alenio-go-alert-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="enterprise-alenio-go-alert-success" role="status">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          className="enterprise-alenio-go-link-btn enterprise-alenio-go-alert-push"
          disabled={busy || (targetKind === "device" && (devices.length === 0 || !!deviceLoadError))}
        >
          {busy ? "Sending…" : "Push alert"}
        </button>
      </form>
    </section>
  );
}
