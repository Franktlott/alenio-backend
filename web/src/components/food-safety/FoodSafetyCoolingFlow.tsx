import { useState } from "react";

type Props = {
  actorName: string;
  busy?: boolean;
  onCreate: (payload: { itemName: string; firstTempF: number }) => Promise<void>;
  onAddReading?: (logId: string, tempF: number) => Promise<{ needsCorrectiveAction: boolean }>;
  activeLogs?: Array<{
    id: string;
    itemName: string;
    status: string;
    nextReadingDueAt: string;
    msUntilNext: number;
  }>;
};

function formatCountdown(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${rem}m`;
}

export function FoodSafetyCoolingFlow({ actorName, busy, onCreate, activeLogs = [] }: Props) {
  const [itemName, setItemName] = useState("");
  const [firstTemp, setFirstTemp] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function startLog() {
    setError(null);
    const temp = Number(firstTemp);
    if (!itemName.trim() || !Number.isFinite(temp)) {
      setError("Enter an item name and starting temperature.");
      return;
    }
    await onCreate({ itemName: itemName.trim(), firstTempF: temp });
    setItemName("");
    setFirstTemp("");
  }

  return (
    <div className="fs-flow fs-flow--cooling">
      <header className="fs-flow-head">
        <p className="fs-flow-kicker">Cooling log</p>
        <h1>Track active cooling</h1>
        <p className="fs-flow-sub">Log start time and temps. Next reading due in 2 hours.</p>
      </header>

      <div className="fs-flow-card">
        <label className="fs-guided-field">
          <span>Item name</span>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Chili batch" />
        </label>
        <label className="fs-guided-field">
          <span>First temp (°F)</span>
          <input
            inputMode="decimal"
            value={firstTemp}
            onChange={(e) => setFirstTemp(e.target.value.replace(/[^\d.-]/g, ""))}
            placeholder="e.g. 140"
          />
        </label>
        {error ? <p className="fs-guided-error">{error}</p> : null}
        <button type="button" className="fs-guided-primary" disabled={busy} onClick={() => void startLog()}>
          Start cooling log
        </button>
        <p className="fs-guided-meta">Logged by {actorName}</p>
      </div>

      {activeLogs.length > 0 ? (
        <section className="fs-flow-list">
          <h2>Active logs</h2>
          <ul>
            {activeLogs.map((log) => (
              <li key={log.id} className={`fs-flow-list-item fs-flow-list-item--${log.status}`}>
                <strong>{log.itemName}</strong>
                <span className={`fs-dash-pill fs-dash-pill--${log.status === "overdue" ? "missed" : "active"}`}>
                  {log.status}
                </span>
                <span>Next reading in {formatCountdown(log.msUntilNext)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
