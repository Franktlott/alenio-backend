import { useState } from "react";
import { postGoVerifyLeaderPin } from "../../lib/api";
import { getGoDeviceId } from "../../lib/go-device";
import { saveGoLeaderSession, type GoLeaderSession } from "../../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../../lib/go-session";

type Props = {
  hubToken: string;
  title?: string;
  subtitle?: string;
  onVerified: (session: GoLeaderSession) => void;
  onCancel?: () => void;
};

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

function normalizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function GoLeaderPinGate({ hubToken, title, subtitle, onVerified, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(currentPin: string) {
    if (currentPin.length < 4) {
      setError("Enter at least 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const leader = await postGoVerifyLeaderPin(hubToken, getGoDeviceId(), currentPin);
      saveGoLeaderSession(hubToken, leader);
      onVerified({
        hubToken,
        userId: leader.userId,
        name: leader.name,
        role: leader.role,
        verifiedAt: Date.now(),
      });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setPin("");
      setError(err instanceof Error ? err.message : "Invalid PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onKey(key: (typeof PIN_KEYS)[number]) {
    if (busy) return;
    setError(null);
    if (key === "clear") {
      setPin("");
      return;
    }
    if (key === "back") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    const next = normalizePin(pin + key);
    setPin(next);
    if (next.length === 8) void submit(next);
  }

  return (
    <div className="go-leader-pin-gate" data-testid="go-leader-pin-gate">
      <div className="go-leader-pin-gate-card">
        <p className="go-leader-pin-gate-kicker">Leader sign-in</p>
        <h1 className="go-leader-pin-gate-title">{title ?? "Enter your Alenio Go PIN"}</h1>
        <p className="go-leader-pin-gate-sub">
          {subtitle ?? "Use the PIN you created in Linked Devices so this walk is tied to you."}
        </p>

        <div className="go-leader-pin-gate-display" aria-live="polite">
          {Array.from({ length: 8 }).map((_, index) => (
            <span
              key={index}
              className={`go-leader-pin-gate-dot${index < pin.length ? " go-leader-pin-gate-dot--filled" : ""}`}
              aria-hidden
            />
          ))}
          <span className="sr-only">{pin.length} digits entered</span>
        </div>

        {error ? (
          <p className="go-leader-pin-gate-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="go-leader-pin-gate-pad">
          {PIN_KEYS.map((key) => {
            if (key === "clear") {
              return (
                <button
                  key={key}
                  type="button"
                  className="go-leader-pin-gate-key go-leader-pin-gate-key--muted"
                  disabled={busy}
                  onClick={() => onKey(key)}
                >
                  Clear
                </button>
              );
            }
            if (key === "back") {
              return (
                <button
                  key={key}
                  type="button"
                  className="go-leader-pin-gate-key go-leader-pin-gate-key--muted"
                  disabled={busy}
                  onClick={() => onKey(key)}
                  aria-label="Delete digit"
                >
                  ⌫
                </button>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className="go-leader-pin-gate-key"
                disabled={busy}
                onClick={() => onKey(key)}
              >
                {key}
              </button>
            );
          })}
        </div>

        <div className="go-leader-pin-gate-actions">
          <button
            type="button"
            className="go-leader-pin-gate-submit"
            disabled={busy || pin.length < 4}
            onClick={() => void submit(pin)}
          >
            {busy ? "Verifying…" : "Continue"}
          </button>
          {onCancel ? (
            <button type="button" className="go-leader-pin-gate-cancel" disabled={busy} onClick={onCancel}>
              Back
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
