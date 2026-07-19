import type { FailureTypedStep } from "./types";
import { emptyTypedStep } from "./types";

type Props = {
  steps: FailureTypedStep[];
  onChange: (steps: FailureTypedStep[]) => void;
  placeholder?: string;
  /** Visual tone for the + Add Step control */
  accent?: "primary" | "danger";
  disabled?: boolean;
  /** Highlight required steps that are still empty */
  showRequiredErrors?: boolean;
};

export function FailureStepList({
  steps,
  onChange,
  placeholder = "Type a corrective action step…",
  accent = "primary",
  disabled = false,
  showRequiredErrors = false,
}: Props) {
  function update(id: string, patch: Partial<FailureTypedStep>) {
    if (disabled) return;
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function remove(id: string) {
    if (disabled) return;
    if (steps.length <= 1) {
      onChange([emptyTypedStep()]);
      return;
    }
    onChange(steps.filter((s) => s.id !== id));
  }

  function move(from: number, to: number) {
    if (disabled) return;
    if (to < 0 || to >= steps.length) return;
    const next = steps.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  }

  return (
    <div className="fp-steps">
      <ul className="fp-steps-list">
        {steps.map((step, index) => (
          <li key={step.id} className="fp-step-row">
            <button
              type="button"
              className="fp-step-grip"
              aria-label={`Move step ${index + 1}`}
              title="Drag to reorder"
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(from)) move(from, index);
              }}
            >
              <IconGrip />
            </button>
            <span className="fp-step-num" aria-hidden>
              {index + 1}
            </span>
            <input
              className={`fp-step-input${
                showRequiredErrors && step.required && !step.text.trim() ? " is-invalid" : ""
              }`}
              value={step.text}
              onChange={(e) => update(step.id, { text: e.target.value })}
              placeholder={placeholder}
              aria-label={`Step ${index + 1}`}
              aria-invalid={showRequiredErrors && step.required && !step.text.trim()}
              disabled={disabled}
            />
            <label className={`fp-step-req${step.required ? " is-on" : ""}`}>
              <input
                type="checkbox"
                checked={step.required}
                disabled={disabled}
                onChange={(e) => update(step.id, { required: e.target.checked })}
              />
              <span>Required</span>
            </label>
            <button
              type="button"
              className="fp-step-trash"
              aria-label={`Remove step ${index + 1}`}
              disabled={disabled}
              onClick={() => remove(step.id)}
            >
              <IconTrash />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`fp-steps-add fp-steps-add--${accent}`}
        disabled={disabled}
        onClick={() => onChange([...steps, emptyTypedStep()])}
      >
        + Add Step
      </button>
    </div>
  );
}

function IconGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="7" r="1.4" />
      <circle cx="15" cy="7" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="17" r="1.4" />
      <circle cx="15" cy="17" r="1.4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
