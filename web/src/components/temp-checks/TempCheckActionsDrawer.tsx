import { useEffect, useRef, useState } from "react";

const QUICK_ACTIONS = [
  "Notify manager",
  "Move product to safe temp",
  "Recheck in 15 minutes",
  "Adjust temperature",
  "Discard product",
] as const;

type Props = {
  open: boolean;
  itemLabel: string;
  tempMinF: string;
  tempMaxF: string;
  actions: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
};

function formatRangePreview(tempMinF: string, tempMaxF: string): string {
  const min = tempMinF.trim();
  const max = tempMaxF.trim();
  if (min && max) return `${min}°F – ${max}°F`;
  if (min) return `≥ ${min}°F`;
  if (max) return `≤ ${max}°F`;
  return "Set min/max on item";
}

export function TempCheckActionsDrawer({
  open,
  itemLabel,
  tempMinF,
  tempMaxF,
  actions,
  onChange,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function addAction(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const exists = actions.some((a) => a.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    onChange([...actions, trimmed]);
    setDraft("");
  }

  function removeAction(index: number) {
    onChange(actions.filter((_, i) => i !== index));
  }

  const availableQuick = QUICK_ACTIONS.filter(
    (preset) => !actions.some((a) => a.toLowerCase() === preset.toLowerCase()),
  );

  return (
    <div className="tc-builder-drawer-root" role="presentation" onClick={onClose}>
      <aside
        className="tc-builder-drawer"
        role="dialog"
        aria-labelledby="tc-builder-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tc-builder-drawer-head">
          <div>
            <p className="tc-builder-drawer-kicker">Out-of-range steps</p>
            <h2 id="tc-builder-drawer-title">{itemLabel.trim() || "Temperature item"}</h2>
            <p className="tc-builder-drawer-meta">{formatRangePreview(tempMinF, tempMaxF)}</p>
          </div>
          <button type="button" className="tc-builder-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="tc-builder-drawer-copy">
          These steps are shown on the floor when a reading falls outside the acceptable temperature range.
        </p>

        <section className="tc-builder-drawer-section">
          <h3>Configured steps</h3>
          {actions.length > 0 ? (
            <ul className="tc-builder-step-list">
              {actions.map((action, index) => (
                <li key={`${action}-${index}`}>
                  <span className="tc-builder-step-index">{index + 1}</span>
                  <span className="tc-builder-step-label">{action}</span>
                  <button
                    type="button"
                    className="tc-builder-step-remove"
                    aria-label={`Remove ${action}`}
                    onClick={() => removeAction(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tc-builder-drawer-empty">No steps yet. Add quick presets or a custom step below.</p>
          )}
        </section>

        {availableQuick.length > 0 ? (
          <section className="tc-builder-drawer-section">
            <h3>Quick add</h3>
            <div className="tc-builder-preset-row">
              {availableQuick.map((preset) => (
                <button key={preset} type="button" className="tc-builder-preset" onClick={() => addAction(preset)}>
                  + {preset}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="tc-builder-drawer-section tc-builder-drawer-section--grow">
          <h3>Custom step</h3>
          <form
            className="tc-builder-custom-add"
            onSubmit={(e) => {
              e.preventDefault();
              addAction(draft);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              placeholder="Describe the corrective step..."
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="tc-builder-drawer-add-btn" disabled={!draft.trim()}>
              Add step
            </button>
          </form>
        </section>

        <footer className="tc-builder-drawer-foot">
          <button type="button" className="tc-builder-drawer-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
