import { useEffect, useMemo, useState } from "react";
import type { TempCheckActionType, TempCheckCompletePayload, TempCheckTemplateRow } from "../../lib/api";
import {
  formatTempCheckWindow,
  formatTempRange,
  isReadingInTempRange,
  isTempCheckWindowOpen,
} from "../../lib/temp-checks-display";

type BranchAction = {
  label: string;
  actionType: TempCheckActionType;
  checklistItems: string[];
};

type DraftReading = {
  itemId: string;
  label: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  correctiveActions: BranchAction[];
  readingRaw: string;
  correctiveAction: string | null;
  priorSteps: string[];
  branchChecklists: Array<{ actionLabel: string; completedItems: string[] }>;
  pendingBranch: string | null;
  pendingChecklistChecked: boolean[];
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

function findBranchAction(actions: BranchAction[], label: string): BranchAction | undefined {
  return actions.find((action) => action.label.toLowerCase() === label.toLowerCase());
}

function isRowResolved(row: DraftReading): boolean {
  if (row.pendingBranch) return false;
  const reading = parseReading(row.readingRaw);
  if (reading == null) return false;
  const inRange = isReadingInTempRange(reading, row.tempMinF, row.tempMaxF);
  if (inRange) return true;
  if (!row.correctiveAction) return false;
  return findBranchAction(row.correctiveActions, row.correctiveAction)?.actionType !== "retemp";
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
      correctiveActions: item.correctiveActions.map((action) => ({
        label: action.label,
        actionType: action.actionType === "retemp" ? "retemp" : "close",
        checklistItems: action.checklistItems ?? [],
      })),
      readingRaw: "",
      correctiveAction: null,
      priorSteps: [],
      branchChecklists: [],
      pendingBranch: null,
      pendingChecklistChecked: [],
      notes: "",
    })),
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"capture" | "review">("capture");

  const completedCount = useMemo(() => readings.filter((row) => isRowResolved(row)).length, [readings]);

  const progressPct = items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);
  const current = readings[focusIndex];
  const currentReading = current ? parseReading(current.readingRaw) : null;
  const currentInRange =
    currentReading != null && current
      ? isReadingInTempRange(currentReading, current.tempMinF, current.tempMaxF)
      : null;
  const pendingAction = current?.pendingBranch
    ? findBranchAction(current.correctiveActions, current.pendingBranch)
    : undefined;
  const pendingChecklistComplete =
    pendingAction?.checklistItems.length
      ? current!.pendingChecklistChecked.length === pendingAction.checklistItems.length &&
        current!.pendingChecklistChecked.every(Boolean)
      : true;

  useEffect(() => {
    if (!current || current.pendingBranch || current.correctiveAction) return;
    const reading = parseReading(current.readingRaw);
    if (reading == null || isReadingInTempRange(reading, current.tempMinF, current.tempMaxF)) return;
    const checklistActions = current.correctiveActions.filter((action) => action.checklistItems.length > 0);
    if (checklistActions.length !== 1) return;
    const target = checklistActions[0]!;
    setReadings((rows) =>
      rows.map((row) =>
        row.itemId === current.itemId
          ? {
              ...row,
              pendingBranch: target.label,
              pendingChecklistChecked: target.checklistItems.map(() => false),
            }
          : row,
      ),
    );
  }, [current?.itemId, current?.readingRaw, current?.pendingBranch, current?.correctiveAction, current?.correctiveActions]);

  function updateRow(itemId: string, patch: Partial<DraftReading>) {
    setReadings((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
    setLocalErr(null);
  }

  function applyBranch(row: DraftReading, actionLabel: string, completedItems: string[]) {
    const action = findBranchAction(row.correctiveActions, actionLabel);
    if (!action) return;
    const checklistEntry = completedItems.length
      ? { actionLabel, completedItems }
      : null;
    const nextChecklists = checklistEntry
      ? [...row.branchChecklists, checklistEntry]
      : row.branchChecklists;

    if (action.actionType === "retemp") {
      updateRow(row.itemId, {
        priorSteps: [...row.priorSteps, actionLabel],
        branchChecklists: nextChecklists,
        readingRaw: "",
        correctiveAction: null,
        pendingBranch: null,
        pendingChecklistChecked: [],
      });
      return;
    }

    updateRow(row.itemId, {
      correctiveAction: actionLabel,
      branchChecklists: nextChecklists,
      pendingBranch: null,
      pendingChecklistChecked: [],
    });
  }

  function selectCorrectiveAction(row: DraftReading, actionLabel: string) {
    const action = findBranchAction(row.correctiveActions, actionLabel);
    if (!action) return;
    if (action.checklistItems.length > 0) {
      updateRow(row.itemId, {
        pendingBranch: actionLabel,
        pendingChecklistChecked: action.checklistItems.map(() => false),
        correctiveAction: null,
      });
      return;
    }
    applyBranch(row, actionLabel, []);
  }

  function confirmPendingBranch(row: DraftReading) {
    if (!row.pendingBranch || !pendingChecklistComplete) return;
    const action = findBranchAction(row.correctiveActions, row.pendingBranch);
    if (!action) return;
    const completedItems = action.checklistItems.filter((_, index) => row.pendingChecklistChecked[index]);
    applyBranch(row, row.pendingBranch, completedItems);
  }

  function togglePendingChecklist(row: DraftReading, itemIndex: number) {
    updateRow(row.itemId, {
      pendingChecklistChecked: row.pendingChecklistChecked.map((checked, index) =>
        index === itemIndex ? !checked : checked,
      ),
    });
  }

  function goNext() {
    if (!current || !isRowResolved(current)) {
      setLocalErr("Enter a temperature. Out-of-range branches need a completed checklist when one is attached.");
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
        correctiveSteps: row.priorSteps.length > 0 ? row.priorSteps : undefined,
        branchChecklists: row.branchChecklists.length > 0 ? row.branchChecklists : undefined,
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
                  {row.priorSteps.length > 0 ? (
                    <span className="go-tc-run-review-retemps">Retemps: {row.priorSteps.join(" → ")}</span>
                  ) : null}
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

  const retempAction = current.correctiveActions.filter((action) => action.actionType === "retemp");
  const closeActions = current.correctiveActions.filter((action) => action.actionType === "close");

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

        {current.priorSteps.length > 0 ? (
          <div className="go-tc-run-retemp-trail">
            <p className="go-tc-run-retemp-trail-label">Steps taken</p>
            <ul>
              {current.priorSteps.map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="go-tc-run-input-wrap">
          <span>Reading (°F)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            autoFocus={!current.pendingBranch}
            value={current.readingRaw}
            placeholder="Enter temperature"
            className="go-tc-run-input"
            onChange={(e) =>
              updateRow(current.itemId, {
                readingRaw: e.target.value,
                correctiveAction: null,
                pendingBranch: null,
                pendingChecklistChecked: [],
              })
            }
          />
        </label>

        {currentReading != null ? (
          <p className={`go-tc-run-status${currentInRange ? " go-tc-run-status--ok" : " go-tc-run-status--alert"}`}>
            {currentInRange
              ? "Within range — item will close when you continue"
              : current.pendingBranch
                ? "Complete every corrective step before taking a new reading"
                : current.correctiveActions.length > 0
                  ? "Out of range — choose a corrective action"
                  : "Out of range — no corrective actions configured for this item"}
          </p>
        ) : null}

        {currentReading != null && !currentInRange && current.pendingBranch && pendingAction ? (
          <div className="go-tc-run-checklist-panel go-tc-run-checklist-panel--preretemp">
            <p className="go-tc-run-checklist-kicker">Corrective steps before recheck</p>
            <p className="go-tc-run-checklist-copy">
              Check off each step. When finished, take a new reading.
            </p>
            <ol className="go-tc-run-checklist">
              {pendingAction.checklistItems.map((item, index) => (
                <li key={`${item}-${index}`}>
                  <label className="go-tc-run-checklist-item">
                    <input
                      type="checkbox"
                      checked={current.pendingChecklistChecked[index] ?? false}
                      onChange={() => togglePendingChecklist(current, index)}
                    />
                    <span>{item}</span>
                  </label>
                </li>
              ))}
            </ol>
            <div className="go-tc-run-checklist-actions">
              <button
                type="button"
                className="go-tc-run-primary"
                disabled={!pendingChecklistComplete}
                onClick={() => confirmPendingBranch(current)}
              >
                {pendingAction.actionType === "retemp"
                  ? "Steps complete — take new reading"
                  : "Steps complete — continue"}
              </button>
            </div>
          </div>
        ) : null}

        {currentReading != null && !currentInRange && !current.pendingBranch && current.correctiveActions.length > 1 ? (
          <div className="go-tc-run-corrective">
            {retempAction.length > 0 ? (
              <div className="go-tc-run-corrective-group">
                <p className="go-tc-run-corrective-label">Corrective actions</p>
                <p className="go-tc-run-corrective-copy">Choose an action, complete required steps, then recheck if needed.</p>
                <div className="go-tc-run-corrective-grid">
                  {retempAction.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="go-tc-run-corrective-btn go-tc-run-corrective-btn--retemp"
                      onClick={() => selectCorrectiveAction(current, action.label)}
                    >
                      {action.label}
                      {action.checklistItems.length > 0 ? (
                        <span className="go-tc-run-corrective-meta">{action.checklistItems.length} steps</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {closeActions.length > 0 ? (
              <div className="go-tc-run-corrective-group">
                <p className="go-tc-run-corrective-label">Close without recheck</p>
                <div className="go-tc-run-corrective-grid">
                  {closeActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="go-tc-run-corrective-btn"
                      onClick={() => selectCorrectiveAction(current, action.label)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentReading != null && !currentInRange && !current.pendingBranch && current.correctiveActions.length === 0 ? (
          <p className="go-tc-run-corrective-empty">No corrective actions configured for this item.</p>
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
        <button type="button" className="go-tc-run-primary" onClick={goNext} disabled={busy || !!current.pendingBranch}>
          {focusIndex === readings.length - 1 ? "Review" : "Next item"}
        </button>
      </div>
    </div>
  );
}
