import { useState } from "react";
import { putGoLeaderPin } from "../../lib/api";

type Props = {
  open: boolean;
  teamId: string;
  leaderName?: string | null;
  onCreated: () => void;
  onDismiss: () => void;
};

function normalizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function GoLeaderPinSetupModal({ open, teamId, leaderName, onCreated, onDismiss }: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function onSavePin() {
    setError(null);
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
      await putGoLeaderPin(teamId, pin);
      setPin("");
      setConfirmPin("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="enterprise-task-modal-backdrop go-leader-pin-setup-backdrop" role="presentation">
      <div
        className="enterprise-task-modal go-leader-pin-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-leader-pin-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="go-leader-pin-kicker">Leader identity</p>
        <h2 id="go-leader-pin-setup-title" className="go-leader-pin-setup-title">
          Create your Alenio Go PIN
        </h2>
        <p className="go-leader-pin-setup-sub enterprise-muted">
          {leaderName ? `${leaderName}, before you use Alenio Go` : "Before you use Alenio Go"}, set a private PIN
          so walks and other kiosk actions are tied to you.
        </p>

        {error ? (
          <p className="enterprise-alenio-go-alert-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="go-leader-pin-form go-leader-pin-setup-form">
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

        <div className="go-leader-pin-setup-actions">
          <button
            type="button"
            className="enterprise-alenio-go-link-btn"
            disabled={saving}
            onClick={() => void onSavePin()}
            data-testid="go-leader-pin-setup-save"
          >
            {saving ? "Saving…" : "Create PIN"}
          </button>
          <button type="button" className="go-leader-pin-setup-later" disabled={saving} onClick={onDismiss}>
            Not now
          </button>
        </div>

        <p className="go-leader-pin-foot enterprise-muted">
          Use a PIN you can remember. Each leader creates their own — do not share it.
        </p>
      </div>
    </div>
  );
}
