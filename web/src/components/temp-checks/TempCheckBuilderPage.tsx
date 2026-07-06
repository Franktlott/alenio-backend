import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { TempCheckEquipmentRow, TempCheckTemplateCreatePayload } from "../../lib/api";
import { fetchTeamTempCheckEquipment } from "../../lib/api";
import { TempCheckBranchFlow } from "./TempCheckBranchFlow";
import {
  buildRecheckBranchActions,
  extractCorrectiveSteps,
  hasCorrectiveStepsForRecheck,
  normalizeBranchActions,
  type TempCheckBranchAction,
} from "../../lib/temp-checks-display";

type ItemRow = {
  id: string;
  equipmentId: string;
  label: string;
  tempMinF: string;
  tempMaxF: string;
  correctiveActions: TempCheckBranchAction[];
};

type Props = {
  teamId: string;
  pageTitle: string;
  pageSubtitle: string;
  busy?: boolean;
  error?: string | null;
  initial?: {
    name: string;
    description: string;
    dueTimeLocal: string;
    windowStartLocal: string;
    windowEndLocal: string;
    items: {
      equipmentId?: string | null;
      label: string;
      tempMinF: number | null;
      tempMaxF: number | null;
      correctiveActions: Array<string | TempCheckBranchAction>;
    }[];
  };
  onSubmit: (payload: TempCheckTemplateCreatePayload) => Promise<void>;
  onCancel: () => void;
};

function newItem(): ItemRow {
  return {
    id: crypto.randomUUID(),
    equipmentId: "",
    label: "",
    tempMinF: "",
    tempMaxF: "",
    correctiveActions: [],
  };
}

function itemsFromInitial(initial?: Props["initial"]): ItemRow[] {
  if (!initial?.items.length) return [newItem()];
  return initial.items.map((item) => ({
    id: crypto.randomUUID(),
    equipmentId: item.equipmentId ?? "",
    label: item.label,
    tempMinF: item.tempMinF != null ? String(item.tempMinF) : "",
    tempMaxF: item.tempMaxF != null ? String(item.tempMaxF) : "",
    correctiveActions: normalizeBranchActions(item.correctiveActions),
  }));
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function TempCheckBuilderPage({
  teamId,
  pageTitle,
  pageSubtitle,
  busy,
  error,
  initial,
  onSubmit,
  onCancel,
}: Props) {
  const [equipment, setEquipment] = useState<TempCheckEquipmentRow[]>([]);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueTimeLocal, setDueTimeLocal] = useState(initial?.dueTimeLocal ?? "06:00");
  const [windowStartLocal, setWindowStartLocal] = useState(initial?.windowStartLocal ?? "06:00");
  const [windowEndLocal, setWindowEndLocal] = useState(initial?.windowEndLocal ?? "07:00");
  const [items, setItems] = useState<ItemRow[]>(() => itemsFromInitial(initial));
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionsItemId, setActionsItemId] = useState<string | null>(null);

  const itemCountLabel = useMemo(() => `${items.length} item${items.length === 1 ? "" : "s"}`, [items.length]);

  useEffect(() => {
    if (!teamId) return;
    void fetchTeamTempCheckEquipment(teamId)
      .then((data) => setEquipment(data.equipment))
      .catch(() => setEquipment([]));
  }, [teamId]);

  function applyEquipment(itemId: string, equipmentId: string) {
    if (!equipmentId) {
      updateItem(itemId, { equipmentId: "" });
      return;
    }
    const row = equipment.find((entry) => entry.id === equipmentId);
    if (!row) return;
    updateItem(itemId, {
      equipmentId,
      label: row.name,
      tempMinF: row.tempMinF != null ? String(row.tempMinF) : "",
      tempMaxF: row.tempMaxF != null ? String(row.tempMaxF) : "",
      correctiveActions: buildRecheckBranchActions(extractCorrectiveSteps(
        row.correctiveActions.map((action) => ({
          label: action.label,
          actionType: action.actionType === "retemp" ? "retemp" : "close",
          checklistItems: action.checklistItems ?? [],
          requireInitials: false,
          requireNote: action.requireNote,
          requirePhoto: action.requirePhoto,
        })),
      )),
    });
  }

  function updateItem(id: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row!);
      return next;
    });
  }

  async function handleSubmit() {
    setLocalError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("Add a check name.");
      return;
    }
    const parsedItems = items
      .map((item) => {
        const label = item.label.trim();
        if (!label) return null;
        const tempMinF = parseNumberInput(item.tempMinF);
        const tempMaxF = parseNumberInput(item.tempMaxF);
        if (tempMinF != null && tempMaxF != null && tempMinF > tempMaxF) return null;
        if (item.correctiveActions.length > 0 && !hasCorrectiveStepsForRecheck(item.correctiveActions)) return null;
        const cleanedActions = item.correctiveActions
          .map((action) => ({
            ...action,
            label: action.label.trim(),
            checklistItems: action.checklistItems.map((entry) => entry.trim()).filter(Boolean),
            requireInitials: false,
          }))
          .filter((action) => action.label);
        return {
          label,
          equipmentId: item.equipmentId || null,
          tempMinF,
          tempMaxF,
          correctiveActions: cleanedActions,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (parsedItems.length === 0) {
      setLocalError("Add at least one item to check. Each out-of-range item needs corrective steps before recheck.");
      return;
    }

    await onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      dueTimeLocal,
      windowStartLocal,
      windowEndLocal,
      items: parsedItems,
    });
  }

  const displayError = localError ?? error;

  return (
    <div className="temp-check-builder">
      <div className="temp-check-builder-inner">
        <header className="temp-check-builder-header">
          <div>
            <Link to="/go/temp-checks" className="temp-check-builder-back" onClick={(e) => { e.preventDefault(); onCancel(); }}>
              ← Temp checks
            </Link>
            <h1 className="temp-check-builder-title">{pageTitle}</h1>
            <p className="temp-check-builder-subtitle">{pageSubtitle}</p>
          </div>
          <div className="temp-check-builder-header-actions">
            <button type="button" className="temp-check-btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="temp-check-btn-primary" onClick={() => void handleSubmit()} disabled={busy}>
              {busy ? "Saving…" : "Save check"}
            </button>
          </div>
        </header>

        {displayError ? <p className="temp-check-builder-error">{displayError}</p> : null}

        <div className="temp-check-builder-grid">
          <section className="temp-check-builder-card">
            <h2>Check details</h2>
            <p className="temp-check-builder-card-copy">Name and instructions shown to leaders on the floor.</p>
            <label className="temp-check-field">
              <span>Check name</span>
              <input
                type="text"
                value={name}
                placeholder="Opening cooler temperatures"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="temp-check-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={description}
                placeholder="What should the leader verify during this check?"
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </section>

          <section className="temp-check-builder-card">
            <h2>Schedule</h2>
            <p className="temp-check-builder-card-copy">
              Checks can only be completed during this window. Submissions outside the schedule are blocked.
            </p>
            <div className="temp-check-schedule-grid">
              <label className="temp-check-field">
                <span>Due time</span>
                <input type="time" value={dueTimeLocal} onChange={(e) => setDueTimeLocal(e.target.value)} />
              </label>
              <label className="temp-check-field">
                <span>Window opens</span>
                <input type="time" value={windowStartLocal} onChange={(e) => setWindowStartLocal(e.target.value)} />
              </label>
              <label className="temp-check-field">
                <span>Window closes</span>
                <input type="time" value={windowEndLocal} onChange={(e) => setWindowEndLocal(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="temp-check-builder-card temp-check-builder-card--wide">
            <div className="temp-check-builder-card-head temp-check-builder-card-head--compact">
              <div>
                <h2>Items to check</h2>
                <p className="temp-check-builder-card-copy temp-check-builder-card-copy--inline">
                  Select equipment standards to pull temperature ranges and corrective action steps.
                </p>
              </div>
              <span className="temp-check-count-pill">{itemCountLabel}</span>
            </div>

            <div className="temp-check-item-table">
              <div className="temp-check-item-table-head" aria-hidden>
                <span>Equipment</span>
                <span>Item</span>
                <span>Min °F</span>
                <span>Max °F</span>
                <span className="temp-check-item-table-head-corrective">Branch flow</span>
                <span />
              </div>
              <div className="temp-check-item-table-body">
                {items.map((item, index) => {
                  const actionCount = item.correctiveActions.length;
                  const flowOpen = actionsItemId === item.id;
                  return (
                    <div key={item.id} className={`temp-check-item-table-group${flowOpen ? " temp-check-item-table-group--flow-open" : ""}`}>
                      <div className="temp-check-item-table-row">
                        <label className="temp-check-item-table-field temp-check-item-table-field--equipment">
                          <span className="sr-only">Equipment {index + 1}</span>
                          <select
                            value={item.equipmentId}
                            onChange={(e) => applyEquipment(item.id, e.target.value)}
                          >
                            <option value="">Select equipment…</option>
                            {equipment.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="temp-check-item-table-field temp-check-item-table-field--name">
                          <span className="sr-only">Item {index + 1} name</span>
                          <input
                            type="text"
                            value={item.label}
                            placeholder={`Item ${index + 1}`}
                            onChange={(e) => updateItem(item.id, { label: e.target.value })}
                          />
                        </label>
                        <label className="temp-check-item-table-field">
                          <span className="sr-only">Min temp</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="Min"
                            value={item.tempMinF}
                            onChange={(e) => updateItem(item.id, { tempMinF: e.target.value })}
                          />
                        </label>
                        <label className="temp-check-item-table-field">
                          <span className="sr-only">Max temp</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="Max"
                            value={item.tempMaxF}
                            onChange={(e) => updateItem(item.id, { tempMaxF: e.target.value })}
                          />
                        </label>
                        <button
                          type="button"
                          className={`tc-builder-steps-btn${flowOpen || actionCount > 0 ? " tc-builder-steps-btn--set" : ""}`}
                          title="Edit branch flow for this item"
                          aria-label={flowOpen ? "Close branch flow" : "Edit branch flow"}
                          aria-expanded={flowOpen}
                          onClick={() => setActionsItemId(flowOpen ? null : item.id)}
                        >
                          {actionCount > 0 ? (
                            <span className="tc-builder-steps-btn-label tc-builder-steps-btn-label--set">
                              <span className="tc-builder-steps-count">{actionCount}</span>
                              <span>branch steps</span>
                            </span>
                          ) : (
                            <span className="tc-builder-steps-btn-label">
                              <span>Edit</span>
                              <span>flow</span>
                            </span>
                          )}
                        </button>
                        <div className="temp-check-item-table-controls">
                          <button type="button" className="temp-check-icon-btn temp-check-icon-btn--tiny" disabled={index === 0} onClick={() => moveItem(item.id, -1)} aria-label="Move up">
                            ↑
                          </button>
                          <button
                            type="button"
                            className="temp-check-icon-btn temp-check-icon-btn--tiny"
                            disabled={index === items.length - 1}
                            onClick={() => moveItem(item.id, 1)}
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="temp-check-icon-btn temp-check-icon-btn--tiny temp-check-icon-btn--danger"
                            disabled={items.length === 1}
                            onClick={() => setItems((prev) => prev.filter((row) => row.id !== item.id))}
                            aria-label="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {flowOpen ? (
                        <div className="tc-builder-item-flow">
                          <TempCheckBranchFlow
                            editable
                            tempMinF={parseNumberInput(item.tempMinF)}
                            tempMaxF={parseNumberInput(item.tempMaxF)}
                            actions={item.correctiveActions}
                            onChange={(next) => updateItem(item.id, { correctiveActions: next })}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="button" className="temp-check-btn-outline temp-check-add-item-btn temp-check-add-item-btn--compact" onClick={() => setItems((prev) => [...prev, newItem()])}>
              + Add item
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
