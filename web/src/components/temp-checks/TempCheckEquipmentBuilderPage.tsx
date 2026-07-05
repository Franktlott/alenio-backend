import { Link } from "react-router-dom";
import { useState } from "react";
import type { TempCheckEquipmentPayload } from "../../lib/api";
import { TempCheckActionsDrawer } from "./TempCheckActionsDrawer";
import { formatTempRange } from "../../lib/temp-checks-display";

type Props = {
  pageTitle: string;
  pageSubtitle: string;
  busy?: boolean;
  error?: string | null;
  initial?: {
    name: string;
    tempMinF: number | null;
    tempMaxF: number | null;
    correctiveActions: string[];
  };
  onSubmit: (payload: TempCheckEquipmentPayload) => Promise<void>;
  onCancel: () => void;
};

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function TempCheckEquipmentBuilderPage({
  pageTitle,
  pageSubtitle,
  busy,
  error,
  initial,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tempMinF, setTempMinF] = useState(initial?.tempMinF != null ? String(initial.tempMinF) : "");
  const [tempMaxF, setTempMaxF] = useState(initial?.tempMaxF != null ? String(initial.tempMaxF) : "");
  const [correctiveActions, setCorrectiveActions] = useState<string[]>(initial?.correctiveActions ?? []);
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  async function handleSubmit() {
    setLocalError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("Add an equipment name.");
      return;
    }
    const min = parseNumberInput(tempMinF);
    const max = parseNumberInput(tempMaxF);
    if (min != null && max != null && min > max) {
      setLocalError("Min temperature must be less than or equal to max.");
      return;
    }

    await onSubmit({
      name: trimmedName,
      tempMinF: min,
      tempMaxF: max,
      correctiveActions,
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
              {busy ? "Saving…" : "Save equipment"}
            </button>
          </div>
        </header>

        {displayError ? <p className="temp-check-builder-error">{displayError}</p> : null}

        <div className="temp-check-builder-grid">
          <section className="temp-check-builder-card temp-check-builder-card--wide">
            <h2>Equipment standard</h2>
            <p className="temp-check-builder-card-copy">
              Define the acceptable temperature range and corrective action steps for this equipment. Programs pull from these standards when items are added.
            </p>
            <label className="temp-check-field">
              <span>Equipment name</span>
              <input
                type="text"
                value={name}
                placeholder="Walk-in cooler"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="temp-check-schedule-grid">
              <label className="temp-check-field">
                <span>Min °F</span>
                <input type="number" inputMode="decimal" placeholder="Min" value={tempMinF} onChange={(e) => setTempMinF(e.target.value)} />
              </label>
              <label className="temp-check-field">
                <span>Max °F</span>
                <input type="number" inputMode="decimal" placeholder="Max" value={tempMaxF} onChange={(e) => setTempMaxF(e.target.value)} />
              </label>
              <label className="temp-check-field">
                <span>Standard range</span>
                <div className="tc-equipment-range-preview">{formatTempRange(parseNumberInput(tempMinF), parseNumberInput(tempMaxF))}</div>
              </label>
            </div>
            <div className="tc-equipment-actions-row">
              <div>
                <strong>Corrective action steps</strong>
                <p className="enterprise-muted">Shown on the floor when readings for this equipment are out of range.</p>
              </div>
              <button
                type="button"
                className={`tc-builder-steps-btn${correctiveActions.length > 0 ? " tc-builder-steps-btn--set" : ""}`}
                onClick={() => setActionsOpen(true)}
              >
                {correctiveActions.length > 0 ? (
                  <span className="tc-builder-steps-btn-label tc-builder-steps-btn-label--set">
                    <span className="tc-builder-steps-count">{correctiveActions.length}</span>
                    <span>corrective steps</span>
                  </span>
                ) : (
                  <span className="tc-builder-steps-btn-label">
                    <span>Corrective</span>
                    <span>action steps</span>
                  </span>
                )}
              </button>
            </div>
          </section>
        </div>
      </div>

      {actionsOpen ? (
        <TempCheckActionsDrawer
          open
          itemLabel={name}
          tempMinF={tempMinF}
          tempMaxF={tempMaxF}
          actions={correctiveActions}
          onChange={setCorrectiveActions}
          onClose={() => setActionsOpen(false)}
        />
      ) : null}
    </div>
  );
}
