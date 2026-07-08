import { useState } from "react";
import { verifyGoModuleTestCode } from "../../lib/api";
import { getGoDeviceId } from "../../lib/go-device";

/** Subtle top banner shown while a module is open in Testing mode. */
export function GoTestingModeBanner() {
  return (
    <div className="go-testing-banner" role="status" data-testid="go-testing-banner">
      <span className="go-testing-banner-tag">🧪 TESTING MODE</span>
      <span className="go-testing-banner-copy">
        Activity completed here will not affect workplace compliance or live reporting.
      </span>
    </div>
  );
}

type TestCodeProps = {
  hubToken: string;
  moduleKey: string;
  moduleName: string;
  onVerified: () => void;
  onCancel: () => void;
};

export function GoKioskModuleTestCodeScreen({
  hubToken,
  moduleKey,
  moduleName,
  onVerified,
  onCancel,
}: TestCodeProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the Test Access Code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyGoModuleTestCode(hubToken, getGoDeviceId(), moduleKey, code.trim());
      onVerified();
    } catch {
      setError("Invalid Test Access Code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="go-testcode-overlay" role="dialog" aria-modal="true" aria-labelledby="go-testcode-title">
      <form className="go-testcode-card" onSubmit={(e) => void submit(e)}>
        <p className="go-testcode-eyebrow">🧪 {moduleName}</p>
        <h2 id="go-testcode-title" className="go-testcode-title">Testing Mode</h2>
        <label className="go-testcode-label" htmlFor="go-testcode-input">
          Enter Test Access Code
        </label>
        <input
          id="go-testcode-input"
          className="go-testcode-input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          data-testid="go-testcode-input"
        />
        {error ? (
          <p className="go-testcode-error" role="alert">{error}</p>
        ) : null}
        <div className="go-testcode-actions">
          <button type="button" className="go-testcode-btn go-testcode-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="go-testcode-btn go-testcode-btn--primary" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
