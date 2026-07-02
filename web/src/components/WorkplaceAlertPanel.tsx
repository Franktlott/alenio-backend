import { useEffect, useState } from "react";
import { fetchTeamGoDevices, postWorkplaceAlert, type GoDeviceRow } from "../lib/api";

type TargetKind = "device" | "all_devices" | "all_users";

type Props = {
  teamId: string;
};

export function WorkplaceAlertPanel({ teamId }: Props) {
  const [devices, setDevices] = useState<GoDeviceRow[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [targetKind, setTargetKind] = useState<TargetKind>("all_devices");
  const [deviceId, setDeviceId] = useState("");
  const [title, setTitle] = useState("Workplace alert");
  const [message, setMessage] = useState("");
  const [playSound, setPlaySound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDevices(true);
    void fetchTeamGoDevices(teamId)
      .then((rows) => {
        if (cancelled) return;
        setDevices(rows);
        if (rows.length > 0) setDeviceId(rows[0]!.deviceId);
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDevices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

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
          ) : devices.length === 0 ? (
            <p className="enterprise-muted">No approved devices yet. Approve a device link first.</p>
          ) : (
            <select
              id="alert-device"
              className="enterprise-alenio-go-alert-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.deviceId}>
                  {d.deviceLabel?.trim() || "Device"} · {d.deviceId.slice(0, 8)}…
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
          disabled={busy || (targetKind === "device" && devices.length === 0)}
        >
          {busy ? "Sending…" : "Push alert"}
        </button>
      </form>
    </section>
  );
}
