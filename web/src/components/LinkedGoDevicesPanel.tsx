import { useCallback, useEffect, useState } from "react";
import { fetchTeamGoDevices, revokeTeamGoDevice, type GoDeviceRow } from "../lib/api";
import { formatApprovalDate } from "../lib/pending-approvals";

type Props = {
  teamId: string;
  variant?: "page" | "compact";
};

function deviceLabel(row: GoDeviceRow): string {
  return row.deviceLabel?.trim() || "Unnamed tablet";
}

function lastSeenLabel(row: GoDeviceRow): string {
  return row.source === "approved" ? `Approved ${formatApprovalDate(row.updatedAt)}` : `Last seen ${formatApprovalDate(row.updatedAt)}`;
}

export function LinkedGoDevicesPanel({ teamId, variant = "page" }: Props) {
  const [devices, setDevices] = useState<GoDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);

  const loadDevices = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    return fetchTeamGoDevices(teamId)
      .then((rows) => setDevices(rows))
      .catch((err) => {
        setDevices([]);
        setLoadErr(err instanceof Error ? err.message : "Could not load linked devices.");
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    void loadDevices();
    const id = window.setInterval(() => void loadDevices(), 30_000);
    return () => window.clearInterval(id);
  }, [loadDevices]);

  async function onUnlink(device: GoDeviceRow) {
    const label = deviceLabel(device);
    if (
      !window.confirm(
        `Unlink ${label} from this workspace?\n\nThe tablet will lose access until it is approved again.`,
      )
    ) {
      return;
    }

    setBusyDeviceId(device.deviceId);
    setLoadErr(null);
    try {
      await revokeTeamGoDevice(teamId, device.deviceId);
      setDevices((prev) => prev.filter((row) => row.deviceId !== device.deviceId));
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : "Could not unlink device.");
    } finally {
      setBusyDeviceId(null);
    }
  }

  const isPage = variant === "page";

  if (loading && devices.length === 0) {
    return <p className="enterprise-muted enterprise-approvals-loading">Loading linked devices…</p>;
  }

  if (loadErr && devices.length === 0) {
    return (
      <p className="enterprise-join-requests-error" role="alert">
        {loadErr}
      </p>
    );
  }

  if (devices.length === 0) {
    return (
      <p className="enterprise-join-requests-empty">
        No linked devices yet. Open Alenio Go on a tablet and approve it when it requests access.
      </p>
    );
  }

  return (
    <>
      {loadErr ? (
        <p className="enterprise-join-requests-error" role="alert">
          {loadErr}
        </p>
      ) : null}
      <ul className={`enterprise-join-requests-list${isPage ? " enterprise-join-requests-list--page" : ""}`}>
        {devices.map((device) => {
          const busy = busyDeviceId === device.deviceId;
          return (
            <li key={device.deviceId} className="enterprise-join-requests-item">
              <div className="enterprise-join-requests-item-text">
                {isPage ? <span className="enterprise-approvals-kind">Linked device</span> : null}
                <strong>{deviceLabel(device)}</strong>
                <span className="enterprise-muted enterprise-join-requests-meta">
                  {lastSeenLabel(device)}
                  {isPage ? <> · ID …{device.deviceId.slice(-8)}</> : null}
                </span>
              </div>
              <div className="enterprise-join-requests-actions">
                <button
                  type="button"
                  className="enterprise-join-requests-btn enterprise-join-requests-btn-decline"
                  disabled={busy}
                  onClick={() => void onUnlink(device)}
                >
                  {busy ? "…" : "Unlink"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
