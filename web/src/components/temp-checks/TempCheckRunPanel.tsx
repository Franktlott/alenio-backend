import { useMemo, useState } from "react";
import type { TempCheckCompletePayload, TempCheckTemplateRow } from "../../lib/api";
import {
  formatTempCheckWindow,
  formatTempRange,
  isReadingInTempRange,
  isTempCheckWindowOpen,
} from "../../lib/temp-checks-display";

type DraftReading = {
  itemId: string;
  label: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  correctiveActions: string[];
  readingRaw: string;
  correctiveAction: string | null;
  notes: string;
};

type Props = {
  template: TempCheckTemplateRow;
  busy?: boolean;
  error?: string | null;
  verifiedLeaderName: string;
  onSignOutLeader: () => void;
  onComplete: (payload: TempCheckCompletePayload) => Promise<void>;
  onCancel: () => void;
};

function parseReading(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

export function TempCheckRunPanel({
  template,
  busy,
  error,
  verifiedLeaderName,
  onSignOutLeader,
  onComplete,
  onCancel,
}: Props) {
  const items = template.items ?? [];
  const windowOpen = isTempCheckWindowOpen(template);
  const [readings, setReadings] = useState<DraftReading[]>(() =>
    items.map((item) => ({
      itemId: item.id,
      label: item.label,
      tempMinF: item.tempMinF,
      tempMaxF: item.tempMaxF,
      correctiveActions: item.correctiveActions.map((a) => a.label),
      readingRaw: "",
      correctiveAction: null,
      notes: "",
    })),
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"capture" | "review">("capture");

  const completedCount = useMemo(
    () =>
      readings.filter((row) => {
        const reading = parseReading(row.readingRaw);
        if (reading == null) return false;
        const inRange = isReadingInTempRange(reading, row.tempMinF, row.tempMaxF);
        if (!inRange && !row.correctiveAction) return false;
        return true;
      }).length,
    [readings],
  );

  const progressPct = items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);
  const current = readings[focusIndex];
  const currentReading = current ? parseReading(current.readingRaw) : null;
  const currentInRange =
    currentReading != null && current
      ? isReadingInTempRange(currentReading, current.tempMinF, current.tempMaxF)
      : null;

  function updateRow(itemId: string, patch: Partial<DraftReading>) {
    setReadings((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
    setLocalErr(null);
  }

  function currentRowValid(row: DraftReading): boolean {
    const reading = parseReading(row.readingRaw);
    if (reading == null) return false;
    const inRange = isReadingInTempRange(reading, row.tempMinF, row.tempMaxF);
    if (!inRange && !row.correctiveAction) return false;
    return true;
  }

  function goNext() {
    if (!current || !currentRowValid(current)) {
      setLocalErr("Enter a temperature and select a corrective step if out of range.");
      return;
    }
    if (focusIndex < readings.length - 1) {
      setFocusIndex((i) => i + 1);
      return;
    }
    if (completedCount === items.length) {
      setPhase("review");
    }
  }

  function goPrev() {
    if (focusIndex > 0) setFocusIndex((i) => i - 1);
  }

  async function submit() {
    if (!windowOpen) {
      setLocalErr("This temp check is outside its scheduled window.");
      return;
    }
    const payload: TempCheckCompletePayload = {
      readings: readings.map((row) => ({
        itemId: row.itemId,
        readingF: parseReading(row.readingRaw)!,
        correctiveAction: row.correctiveAction,
        notes: row.notes.trim() || null,
      })),
    };
    await onComplete(payload);
  }

  if (!windowOpen) {
    return (
      <div className="go-tc-run">
        <div className="go-tc-run-blocked">
          <p className="go-tc-run-blocked-kicker">Schedule window closed</p>
          <h1>{template.name}</h1>
          <p>
            This temp check can only be completed during its scheduled window ({formatTempCheckWindow(template)}).
          </p>
          <button type="button" className="go-tc-run-secondary" onClick={onCancel}>
            Back to programs
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="go-tc-run" data-testid="go-temp-check-run-review">
        <header className="go-tc-run-head">
          <div>
            <p className="go-tc-run-kicker">Review & submit</p>
            <h1>{template.name}</h1>
            <p className="go-tc-run-meta">
              Leader {verifiedLeaderName} · {items.length} items · Window {formatTempCheckWindow(template)}
            </p>
          </div>
          <button type="button" className="go-tc-run-link" onClick={onSignOutLeader}>
            Sign out leader
          </button>
        </header>

        <ul className="go-tc-run-review-list">
          {readings.map((row) => {
            const reading = parseReading(row.readingRaw)!;
            const inRange = isReadingInTempRange(reading, row.tempMinF, row.tempMaxF);
            return (
              <li key={row.itemId} className={inRange ? "go-tc-run-review-row--ok" : "go-tc-run-review-row--alert"}>
                <div>
                  <strong>{row.label}</strong>
                  <span>
                    {reading}°F · Target {formatTempRange(row.tempMinF, row.tempMaxF)}
                  </span>
                </div>
                <span className="go-tc-run-review-status">{inRange ? "In range" : row.correctiveAction}</span>
              </li>
            );
          })}
        </ul>

        {error || localErr ? (
          <p className="go-dash-error" role="alert">
            {error || localErr}
          </p>
        ) : null}

        <div className="go-tc-run-actions">
          <button type="button" className="go-tc-run-secondary" onClick={() => setPhase("capture")} disabled={busy}>
            Edit readings
          </button>
          <button type="button" className="go-tc-run-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Submitting…" : "Submit temp check"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="go-tc-run" data-testid="go-temp-check-run-panel">
      <header className="go-tc-run-head">
        <div>
          <p className="go-tc-run-kicker">
            Item {focusIndex + 1} of {items.length}
          </p>
          <h1>{template.name}</h1>
          <p className="go-tc-run-meta">
            Leader {verifiedLeaderName} · Window {formatTempCheckWindow(template)}
          </p>
        </div>
        <button type="button" className="go-tc-run-link" onClick={onSignOutLeader}>
          Sign out leader
        </button>
      </header>

      <div className="go-tc-run-progress" aria-hidden>
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <article className="go-tc-run-item-card">
        <p className="go-tc-run-item-label">Temperature item</p>
        <h2>{current.label}</h2>
        <p className="go-tc-run-item-range">
          Acceptable range <strong>{formatTempRange(current.tempMinF, current.tempMaxF)}</strong>
        </p>

        <label className="go-tc-run-input-wrap">
          <span>Reading (°F)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            autoFocus
            value={current.readingRaw}
            placeholder="Enter temperature"
            className="go-tc-run-input"
            onChange={(e) => updateRow(current.itemId, { readingRaw: e.target.value, correctiveAction: null })}
          />
        </label>

        {currentReading != null ? (
          <p className={`go-tc-run-status${currentInRange ? " go-tc-run-status--ok" : " go-tc-run-status--alert"}`}>
            {currentInRange ? "Within acceptable range" : "Outside range — select a corrective step"}
          </p>
        ) : null}

        {currentReading != null && !currentInRange ? (
          <div className="go-tc-run-corrective">
            <p className="go-tc-run-corrective-label">Corrective step</p>
            {current.correctiveActions.length > 0 ? (
              <div className="go-tc-run-corrective-grid">
                {current.correctiveActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`go-tc-run-corrective-btn${current.correctiveAction === action ? " go-tc-run-corrective-btn--active" : ""}`}
                    onClick={() => updateRow(current.itemId, { correctiveAction: action })}
                  >
                    {action}
                  </button>
                ))}
              </div>
            ) : (
              <p className="go-tc-run-corrective-empty">No corrective steps configured for this item.</p>
            )}
          </div>
        ) : null}
      </article>

      {error || localErr ? (
        <p className="go-dash-error" role="alert">
          {error || localErr}
        </p>
      ) : null}

      <div className="go-tc-run-actions">
        <button type="button" className="go-tc-run-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="go-tc-run-secondary" onClick={goPrev} disabled={focusIndex === 0 || busy}>
          Previous
        </button>
        <button type="button" className="go-tc-run-primary" onClick={goNext} disabled={busy}>
          {focusIndex === readings.length - 1 ? "Review" : "Next item"}
        </button>
      </div>
    </div>
  );
}
