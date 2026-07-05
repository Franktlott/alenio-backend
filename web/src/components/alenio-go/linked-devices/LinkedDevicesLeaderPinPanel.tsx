import { useCallback, useEffect, useState } from "react";
import { fetchGoLeaderPinStatus, putGoLeaderPin } from "../../../lib/api";

type Props = {
  teamId: string;
  leaderName?: string | null;
};

function normalizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function LinkedDevicesLeaderPinPanel({ teamId, leaderName }: Props) {
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchGoLeaderPinStatus(teamId)
      .then((status) => setHasPin(status.hasPin))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load your Alenio Go PIN status."),
      )
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSavePin() {
    setError(null);
    setSaved(false);
    if (pin.length < 4 || pin.length > 8) {
      setError("Choose a PIN that is 4 to 8 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setSaving(true);
    try {
      const status = await putGoLeaderPin(teamId, pin);
      setHasPin(status.hasPin);
      setPin("");
      setConfirmPin("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="go-backend-module-panel go-backend-panel-card go-leader-pin-panel">
      {loading ? <p className="enterprise-muted">Loading leader PIN settings…</p> : null}
      {error ? (
        <p className="enterprise-alenio-go-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="go-frontend-settings-saved" role="status">
          PIN saved.
        </p>
      ) : null}

      {!loading ? (
        <>
          <div className="go-leader-pin-hero">
            <div>
              <p className="go-leader-pin-kicker">Leader identity</p>
              <h2 className="go-backend-panel-title">Create your Alenio Go PIN</h2>
              <p className="go-backend-panel-sub">
                {leaderName ? `${leaderName}, set a private PIN` : "Set a private PIN"} so future Alenio Go actions can be tied back to the leader who performed them.
              </p>
            </div>
            <span className={`go-leader-pin-status${hasPin ? " go-leader-pin-status--ready" : ""}`}>
              {hasPin ? "PIN created" : "No PIN yet"}
            </span>
          </div>

          <div className="go-leader-pin-form">
            <label>
              <span>New PIN</span>
              <input
                value={pin}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="4-8 digits"
                maxLength={8}
                onChange={(e) => setPin(normalizePin(e.target.value))}
              />
            </label>
            <label>
              <span>Confirm PIN</span>
              <input
                value={confirmPin}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="Re-enter PIN"
                maxLength={8}
                onChange={(e) => setConfirmPin(normalizePin(e.target.value))}
              />
            </label>
          </div>

          <div className="go-leader-pin-actions">
            <button
              type="button"
              className="enterprise-alenio-go-link-btn"
              disabled={saving}
              onClick={() => void onSavePin()}
              data-testid="go-leader-pin-save"
            >
              {saving ? "Saving…" : hasPin ? "Update PIN" : "Create PIN"}
            </button>
          </div>

          <p className="go-leader-pin-foot enterprise-muted">
            Use a PIN you can remember. Do not share it with other leaders; each leader should create their own.
          </p>
        </>
      ) : null}
    </div>
  );
}
