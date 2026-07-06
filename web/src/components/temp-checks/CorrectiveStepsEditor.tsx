import { useState } from "react";

type Props = {
  steps: string[];
  onChange?: (steps: string[]) => void;
  readOnly?: boolean;
};

function cleanSteps(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of items) {
    const label = row.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

export function CorrectiveStepsEditor({ steps, onChange, readOnly = false }: Props) {
  const [draft, setDraft] = useState("");

  function updateStep(index: number, value: string) {
    onChange?.(cleanSteps(steps.map((step, i) => (i === index ? value : step))));
  }

  function removeStep(index: number) {
    onChange?.(steps.filter((_, i) => i !== index));
  }

  function addStep() {
    const trimmed = draft.trim();
    if (!trimmed || !onChange) return;
    onChange(cleanSteps([...steps, trimmed]));
    setDraft("");
  }

  if (readOnly) {
    return (
      <div className="tc-corrective-steps tc-corrective-steps--readonly">
        <p className="tc-corrective-steps-intro">
          Leaders check off each step before continuing.
        </p>
        {steps.length > 0 ? (
          <ol className="tc-floor-flow-steps-list tc-floor-flow-steps-list--readonly">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          <p className="tc-es-empty">No corrective steps configured.</p>
        )}
      </div>
    );
  }

  return (
    <div className="tc-corrective-steps">
      <p className="tc-corrective-steps-intro">
        Add steps leaders must check off when a reading is out of range.
      </p>
      {steps.length > 0 ? (
        <ol className="tc-floor-flow-steps-list">
          {steps.map((step, index) => (
            <li key={`${index}-${step}`}>
              <input
                type="text"
                className="tc-floor-flow-steps-input"
                value={step}
                aria-label={`Corrective step ${index + 1}`}
                onChange={(e) => updateStep(index, e.target.value)}
              />
              <button
                type="button"
                className="tc-floor-flow-steps-remove"
                onClick={() => removeStep(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="tc-es-empty">No steps yet. Add at least one corrective step.</p>
      )}
      <form
        className="tc-floor-flow-steps-add"
        onSubmit={(e) => {
          e.preventDefault();
          addStep();
        }}
      >
        <input
          type="text"
          value={draft}
          placeholder="e.g. Adjust thermostat dial"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          Add step
        </button>
      </form>
    </div>
  );
}
