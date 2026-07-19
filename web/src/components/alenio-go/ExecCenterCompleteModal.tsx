import { useEffect, useMemo, useState } from "react";
import {
  completeWalkRun,
  startOccurrenceRun,
  submitWalkItemResponse,
} from "../../lib/walks/library-api";
import type { WalkRun, WalkRunSnapshotItem } from "../../lib/walks/types";

type OccurrenceSummary = {
  id: string;
  dueAt: string;
  windowStart: string;
  graceEndsAt?: string;
  status: string;
  runId?: string | null;
  template?: { id: string; name: string } | null;
};

type Props = {
  teamId: string;
  occurrence: OccurrenceSummary;
  onClose: () => void;
  onCompleted: () => void;
};

type GateState =
  | { kind: "open" }
  | { kind: "not_open"; opensAt: string }
  | { kind: "closed"; closedAt: string };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function gateForOccurrence(occurrence: OccurrenceSummary, now = new Date()): GateState {
  const start = new Date(occurrence.windowStart).getTime();
  const end = new Date(occurrence.graceEndsAt ?? occurrence.dueAt).getTime();
  if (Number.isFinite(start) && now.getTime() < start) {
    return { kind: "not_open", opensAt: occurrence.windowStart };
  }
  if (Number.isFinite(end) && now.getTime() > end) {
    return { kind: "closed", closedAt: occurrence.graceEndsAt ?? occurrence.dueAt };
  }
  return { kind: "open" };
}

function isWindowGateMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("hasn’t opened") ||
    lower.includes("hasn't opened") ||
    lower.includes("not available for entry") ||
    lower.includes("window has closed") ||
    lower.includes("entry window has ended") ||
    lower.includes("outside")
  );
}

function temperatureHint(config: Record<string, unknown>): string {
  const unit = config.unit === "C" ? "°C" : "°F";
  const comparison = String(config.comparisonType ?? "ABOVE");
  const min = config.minimumTemperature;
  const max = config.maximumTemperature;
  if (comparison === "BELOW" && max != null) return `Must be ≤ ${max}${unit}`;
  if (comparison === "BETWEEN" && min != null && max != null) {
    return `Must be between ${min}${unit} and ${max}${unit}`;
  }
  if (min != null) return `Must be ≥ ${min}${unit}`;
  return `Enter temperature (${unit})`;
}

function isAnswered(item: WalkRunSnapshotItem): boolean {
  return Boolean(item.response && item.response.status !== "NOT_STARTED");
}

function runnableItems(run: WalkRun): WalkRunSnapshotItem[] {
  return [...run.items]
    .filter((i) => i.type !== "INSTRUCTION")
    .sort((a, b) => a.position - b.position);
}

function firstOpenIndex(run: WalkRun): number {
  const items = runnableItems(run);
  const idx = items.findIndex((i) => !isAnswered(i));
  return idx >= 0 ? idx : Math.max(0, items.length - 1);
}

export function ExecCenterCompleteModal({ teamId, occurrence, onClose, onCompleted }: Props) {
  const [run, setRun] = useState<WalkRun | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<GateState>(() => gateForOccurrence(occurrence));
  const [tempValue, setTempValue] = useState("");
  const [done, setDone] = useState(false);
  const [lateEntry, setLateEntry] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  useEffect(() => {
    let cancelled = false;
    const initialGate = gateForOccurrence(occurrence);
    setGate(initialGate);
    setError(null);
    setRun(null);
    setDone(false);
    setLateEntry(false);

    if (initialGate.kind !== "open") {
      setLoading(false);
      return;
    }

    setLoading(true);
    void startOccurrenceRun(teamId, occurrence.id)
      .then((started) => {
        if (cancelled) return;
        setRun(started);
        setIndex(firstOpenIndex(started));
        setTempValue("");
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not start checklist";
        if (isWindowGateMessage(message)) {
          setGate(gateForOccurrence(occurrence));
          setError(null);
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, occurrence]);

  function beginLateEntry() {
    setLoading(true);
    setError(null);
    setLateEntry(true);
    void startOccurrenceRun(teamId, occurrence.id, { lateEntryOverride: true })
      .then((started) => {
        setRun(started);
        setIndex(firstOpenIndex(started));
        setTempValue("");
        setGate({ kind: "open" });
      })
      .catch((err) => {
        setLateEntry(false);
        setError(err instanceof Error ? err.message : "Could not start late entry");
      })
      .finally(() => setLoading(false));
  }

  const items = useMemo(() => (run ? runnableItems(run) : []), [run]);
  const current = items[index] ?? null;
  const progressLabel =
    items.length > 0 ? `${Math.min(index + 1, items.length)} of ${items.length}` : "";

  async function saveCurrent(response: unknown) {
    if (!run || !current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await submitWalkItemResponse(teamId, run.id, current.id, {
        response,
        skipFailureProcedure: true,
        adminOverride: true,
        adminOverrideReason: lateEntry
          ? "Execution Center late entry (manager override)"
          : "Execution Center manual entry",
        lateEntryOverride: lateEntry || undefined,
      });
      setRun(next);
      setTempValue("");
      const nextItems = runnableItems(next);
      const nextOpen = nextItems.findIndex((i) => !isAnswered(i));
      if (nextOpen >= 0) {
        setIndex(nextOpen);
        return;
      }
      const completed = await completeWalkRun(
        teamId,
        run.id,
        lateEntry ? { lateEntryOverride: true } : undefined,
      );
      setRun(completed);
      setDone(true);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const unit =
    current?.type === "TEMPERATURE" && current.config.unit === "C" ? "C" : "F";

  return (
    <div className="exec-results-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="exec-results-modal exec-complete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exec-complete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="exec-results-head">
          <div>
            <h2 id="exec-complete-title">
              {occurrence.template?.name ?? run?.template?.name ?? "Complete checklist"}
            </h2>
            <p>
              Due {formatTime(occurrence.dueAt)}
              {progressLabel ? ` · Item ${progressLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="exec-results-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="exec-results-body">
          {loading ? <p className="exec-results-muted">Starting checklist…</p> : null}

          {!loading && gate.kind === "not_open" ? (
            <div className="exec-complete-notice" role="status">
              <div className="exec-complete-notice-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M10 5.75V10.5l2.75 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="exec-complete-notice-copy">
                <span className="exec-complete-notice-kicker">Scheduled window</span>
                <strong>Not available for entry yet</strong>
                <p>
                  This checklist opens at <span>{formatTime(gate.opensAt)}</span> and is due{" "}
                  <span>{formatTime(occurrence.dueAt)}</span>. Manual completion will unlock when
                  the window starts.
                </p>
              </div>
            </div>
          ) : null}

          {!loading && gate.kind === "closed" ? (
            <div className="exec-complete-notice exec-complete-notice--closed" role="status">
              <div className="exec-complete-notice-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M7 7l6 6M13 7l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="exec-complete-notice-copy">
                <span className="exec-complete-notice-kicker">Window closed</span>
                <strong>Entry period has ended</strong>
                <p>
                  The completion window closed at <span>{formatTime(gate.closedAt)}</span>. Floor
                  associates cannot complete it — managers may use late entry below.
                </p>
                <button
                  type="button"
                  className="exec-results-done"
                  style={{ marginTop: "0.75rem" }}
                  disabled={busy || loading}
                  onClick={() => beginLateEntry()}
                >
                  Manager late entry
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="exec-complete-notice exec-complete-notice--error" role="alert">
              <div className="exec-complete-notice-copy">
                <strong>Unable to start checklist</strong>
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {done && run ? (
            <div className="exec-complete-done">
              <strong>Checklist complete</strong>
              <p>Results are saved and will show in Execution Center.</p>
            </div>
          ) : null}

          {!loading && !done && gate.kind === "open" && current ? (
            <div className="exec-complete-form">
              <div className="exec-complete-notice exec-complete-notice--override" role="note">
                <div className="exec-complete-notice-copy">
                  <span className="exec-complete-notice-kicker">Admin override</span>
                  <strong>Failure procedure skipped</strong>
                  <p>
                    Manual entry saves pass/fail only. Corrective-action steps from the floor
                    procedure are not required here — this is recorded on the result.
                  </p>
                </div>
              </div>
              <p className="exec-complete-kicker">{String(current.type).replace(/_/g, " ")}</p>
              <h3>{current.title}</h3>
              {current.description ? <p className="exec-complete-desc">{current.description}</p> : null}
              {current.instructions ? (
                <p className="exec-complete-desc">{current.instructions}</p>
              ) : null}

              {current.type === "TEMPERATURE" ? (
                <>
                  <p className="exec-complete-hint">{temperatureHint(current.config ?? {})}</p>
                  <div className="exec-complete-temp-row">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="exec-complete-input"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      placeholder={`°${unit}`}
                      disabled={busy}
                      autoFocus
                    />
                    <span className="exec-complete-unit">°{unit}</span>
                    <button
                      type="button"
                      className="exec-results-done"
                      disabled={busy || tempValue.trim() === "" || Number.isNaN(Number(tempValue))}
                      onClick={() =>
                        void saveCurrent({
                          value: Number(tempValue),
                          unit,
                          source: "manual",
                        })
                      }
                    >
                      {busy ? "Saving…" : "Save & continue"}
                    </button>
                  </div>
                </>
              ) : null}

              {current.type === "YES_NO" ? (
                <div className="exec-complete-actions">
                  <button
                    type="button"
                    className="exec-results-done"
                    disabled={busy}
                    onClick={() => void saveCurrent({ answer: "YES" })}
                  >
                    {(current.config.yesLabel as string) || "Yes"}
                  </button>
                  <button
                    type="button"
                    className="exec-complete-secondary"
                    disabled={busy}
                    onClick={() => void saveCurrent({ answer: "NO" })}
                  >
                    {(current.config.noLabel as string) || "No"}
                  </button>
                </div>
              ) : null}

              {current.type !== "TEMPERATURE" && current.type !== "YES_NO" ? (
                <p className="exec-results-muted">
                  This item type needs the Temps app or kiosk. Skip ahead or close and complete
                  on the floor.
                </p>
              ) : null}

              {items.length > 1 ? (
                <ol className="exec-complete-steps">
                  {items.map((item, i) => (
                    <li
                      key={item.id}
                      className={
                        i === index
                          ? "is-current"
                          : isAnswered(item)
                            ? "is-done"
                            : undefined
                      }
                    >
                      {item.title}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="exec-results-foot">
          <button type="button" className="exec-complete-secondary" onClick={onClose} disabled={busy}>
            {done || gate.kind !== "open" || error ? "Close" : "Cancel"}
          </button>
        </footer>
      </div>
    </div>
  );
}
