import { useMemo, useState } from "react";
import { bluetoothProbeAdapter } from "../../lib/bluetooth-probe";
import type { HaccpCorrectiveActionType, HaccpItemStatus, HaccpRunRow } from "../../lib/food-safety-api";
import { CORRECTIVE_ACTION_LABELS } from "../../lib/food-safety-api";

type Props = {
  run: HaccpRunRow;
  actorName: string;
  busy?: boolean;
  onSaveItem: (
    itemId: string,
    payload: {
      readingF?: number | null;
      status: HaccpItemStatus;
      entryMethod?: "manual" | "bluetooth";
      notes?: string | null;
      photoUrl?: string | null;
    },
  ) => Promise<{ needsCorrectiveAction: boolean }>;
  onCorrectiveAction: (
    itemId: string,
    payload: { actionType: HaccpCorrectiveActionType; notes?: string | null; photoUrl?: string | null },
  ) => Promise<void>;
  onComplete: () => Promise<void>;
  onExit: () => void;
};

export function FoodSafetyGuidedRun({
  run,
  actorName,
  busy,
  onSaveItem,
  onCorrectiveAction,
  onComplete,
  onExit,
}: Props) {
  const pendingItems = useMemo(() => run.items.filter((i) => !i.completedAt), [run.items]);
  const currentIndex = run.items.length - pendingItems.length;
  const item = pendingItems[0] ?? null;

  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [correctiveItemId, setCorrectiveItemId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<HaccpCorrectiveActionType>("discarded");
  const [actionNotes, setActionNotes] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function connectProbe() {
    setProbeMsg(null);
    const result = await bluetoothProbeAdapter.connect();
    if (!result.ok) {
      setProbeMsg(result.message ?? "Bluetooth probe unavailable.");
      return;
    }
    const value = await bluetoothProbeAdapter.readTemperature();
    if (value) setReading(String(value.tempF));
  }

  async function submitItem(status: HaccpItemStatus) {
    if (!item) return;
    setLocalErr(null);
    const readingF = status === "na" ? null : Number(reading);
    if (status !== "na" && !Number.isFinite(readingF)) {
      setLocalErr("Enter a temperature or mark N/A.");
      return;
    }
    const result = await onSaveItem(item.id, {
      readingF,
      status,
      entryMethod: "manual",
      notes: notes.trim() || null,
    });
    setReading("");
    setNotes("");
    if (result.needsCorrectiveAction) {
      setCorrectiveItemId(item.id);
      return;
    }
    if (pendingItems.length <= 1) {
      await onComplete();
    }
  }

  async function submitCorrective() {
    if (!correctiveItemId) return;
    await onCorrectiveAction(correctiveItemId, {
      actionType,
      notes: actionNotes.trim() || null,
    });
    setCorrectiveItemId(null);
    setActionNotes("");
    if (pendingItems.length <= 1) {
      await onComplete();
    }
  }

  if (correctiveItemId) {
    const failedItem = run.items.find((i) => i.id === correctiveItemId);
    return (
      <div className="fs-guided fs-guided--corrective" data-testid="food-safety-corrective">
        <header className="fs-guided-head">
          <p className="fs-guided-kicker">Corrective action required</p>
          <h1>{failedItem?.label ?? "Out of range"}</h1>
          <p className="fs-guided-sub">Record what was done before continuing.</p>
        </header>
        <div className="fs-guided-card">
          <div className="fs-corrective-options">
            {(Object.keys(CORRECTIVE_ACTION_LABELS) as HaccpCorrectiveActionType[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`fs-corrective-option${actionType === key ? " fs-corrective-option--active" : ""}`}
                onClick={() => setActionType(key)}
              >
                {CORRECTIVE_ACTION_LABELS[key]}
              </button>
            ))}
          </div>
          <label className="fs-guided-field">
            <span>Notes (optional)</span>
            <textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} rows={3} />
          </label>
          <p className="fs-guided-meta">Recorded as {actorName}</p>
          <button type="button" className="fs-guided-primary" disabled={busy} onClick={() => void submitCorrective()}>
            Save corrective action &amp; continue
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="fs-guided fs-guided--complete">
        <h1>Check complete</h1>
        <p className="fs-guided-sub">{run.templateName} is finished for today.</p>
        <button type="button" className="fs-guided-primary" onClick={onExit}>
          Back to Food Safety
        </button>
      </div>
    );
  }

  const progressPct = run.itemsTotal > 0 ? Math.round((currentIndex / run.itemsTotal) * 100) : 0;

  return (
    <div className="fs-guided" data-testid="food-safety-guided-run">
      <header className="fs-guided-head">
        <button type="button" className="fs-guided-exit" onClick={onExit}>
          ← Exit
        </button>
        <p className="fs-guided-kicker">{run.templateName}</p>
        <h1>
          Item {currentIndex + 1} of {run.itemsTotal}
        </h1>
        <div className="fs-guided-progress">
          <div className="fs-guided-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="fs-guided-window">
          {run.dueLabel ?? "Due window"} {run.windowStart && run.windowEnd ? `(${run.windowStart}–${run.windowEnd})` : ""}
        </p>
      </header>

      <div className="fs-guided-card">
        <h2 className="fs-guided-item-name">{item.label}</h2>
        <p className="fs-guided-range">Required: {item.tempRangeLabel}</p>

        <div className="fs-guided-actions-row">
          <button type="button" className="fs-guided-probe" onClick={() => void connectProbe()} disabled={busy}>
            Connect probe
          </button>
          <label className="fs-guided-field fs-guided-field--inline">
            <span>Manual entry (°F)</span>
            <input
              inputMode="decimal"
              value={reading}
              onChange={(e) => setReading(e.target.value.replace(/[^\d.-]/g, ""))}
              placeholder="e.g. 38"
            />
          </label>
        </div>
        {probeMsg ? <p className="fs-guided-hint">{probeMsg}</p> : null}

        <label className="fs-guided-field">
          <span>Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        {localErr ? (
          <p className="fs-guided-error" role="alert">
            {localErr}
          </p>
        ) : null}

        <div className="fs-guided-footer">
          {item.allowNa ? (
            <button type="button" className="fs-guided-secondary" disabled={busy} onClick={() => void submitItem("na")}>
              N/A
            </button>
          ) : null}
          <button type="button" className="fs-guided-primary" disabled={busy} onClick={() => void submitItem("pass")}>
            {pendingItems.length <= 1 ? "Finish check" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
