import { useState } from "react";

type Props = {
  actorName: string;
  busy?: boolean;
  onSave: (actualTempF: number) => Promise<{ passed: boolean; nextDueAt: string }>;
};

export function FoodSafetyCalibrationFlow({ actorName, busy, onSave }: Props) {
  const [actual, setActual] = useState("");
  const [result, setResult] = useState<{ passed: boolean; nextDueAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const actualTempF = Number(actual);
    if (!Number.isFinite(actualTempF)) {
      setError("Enter the probe reading from ice water.");
      return;
    }
    const saved = await onSave(actualTempF);
    setResult(saved);
    setActual("");
  }

  return (
    <div className="fs-flow fs-flow--calibration">
      <header className="fs-flow-head">
        <p className="fs-flow-kicker">Probe calibration</p>
        <h1>Ice water check</h1>
        <p className="fs-flow-sub">Target 32°F. Pass if within ±2°F.</p>
      </header>

      <div className="fs-flow-card">
        <div className="fs-calibration-target">
          <span>Target</span>
          <strong>32°F</strong>
        </div>
        <label className="fs-guided-field">
          <span>Actual reading (°F)</span>
          <input
            inputMode="decimal"
            value={actual}
            onChange={(e) => setActual(e.target.value.replace(/[^\d.-]/g, ""))}
            placeholder="e.g. 31.8"
          />
        </label>
        {error ? <p className="fs-guided-error">{error}</p> : null}
        {result ? (
          <p className={`fs-calibration-result${result.passed ? " fs-calibration-result--pass" : " fs-calibration-result--fail"}`}>
            {result.passed ? "Calibration passed." : "Calibration failed — notify maintenance."}
            <span>Next due {new Date(result.nextDueAt).toLocaleDateString()}</span>
          </p>
        ) : null}
        <button type="button" className="fs-guided-primary" disabled={busy} onClick={() => void submit()}>
          Save calibration
        </button>
        <p className="fs-guided-meta">Performed by {actorName}</p>
      </div>
    </div>
  );
}
