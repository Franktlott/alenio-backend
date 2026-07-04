import { useState } from "react";

type Props = {
  busy?: boolean;
  error?: string | null;
  initial?: {
    name: string;
    workplace: string;
    scoringEnabled: boolean;
    items: { label: string }[];
  };
  submitLabel?: string;
  onSubmit: (payload: {
    name: string;
    workplace: string;
    scoringEnabled: boolean;
    items: { label: string }[];
  }) => Promise<void>;
};

export function WalkTemplateForm({ busy, error, initial, submitLabel = "Save walk", onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [workplace, setWorkplace] = useState(initial?.workplace ?? "");
  const [scoringEnabled, setScoringEnabled] = useState(initial?.scoringEnabled ?? true);
  const [items, setItems] = useState<string[]>(
    initial?.items?.length ? initial.items.map((i) => i.label) : ["", "", ""],
  );
  const [localErr, setLocalErr] = useState<string | null>(null);

  function updateItem(index: number, value: string) {
    setItems((rows) => rows.map((row, i) => (i === index ? value : row)));
  }

  function addItem() {
    setItems((rows) => [...rows, ""]);
  }

  function removeItem(index: number) {
    setItems((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    const trimmedItems = items.map((row) => row.trim()).filter(Boolean);
    if (!name.trim() || !workplace.trim()) {
      setLocalErr("Walk name and workplace are required.");
      return;
    }
    if (trimmedItems.length === 0) {
      setLocalErr("Add at least one observation item.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      workplace: workplace.trim(),
      scoringEnabled,
      items: trimmedItems.map((label) => ({ label })),
    });
  }

  return (
    <form className="walk-template-form" onSubmit={(e) => void handleSubmit(e)}>
      <label className="enterprise-alenio-go-alert-label" htmlFor="walk-name">
        Walk name
      </label>
      <input
        id="walk-name"
        className="enterprise-alenio-go-alert-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Opening standards walk"
        maxLength={200}
        required
      />

      <label className="enterprise-alenio-go-alert-label" htmlFor="walk-workplace">
        Workplace / location
      </label>
      <input
        id="walk-workplace"
        className="enterprise-alenio-go-alert-input"
        value={workplace}
        onChange={(e) => setWorkplace(e.target.value)}
        placeholder="e.g. Front of house"
        maxLength={200}
        required
      />

      <label className="walk-template-toggle">
        <input
          type="checkbox"
          checked={scoringEnabled}
          onChange={(e) => setScoringEnabled(e.target.checked)}
        />
        <span>Enable scoring (pass rate % on completed walks)</span>
      </label>

      <div className="walk-template-items-head">
        <h3 className="walk-template-items-title">Observation items</h3>
        <button type="button" className="walk-template-add-item" onClick={addItem}>
          + Add item
        </button>
      </div>
      <p className="enterprise-muted walk-template-items-copy">
        Each item is reviewed as Pass, Needs Attention, or N/A during the walk.
      </p>

      <ul className="walk-template-items">
        {items.map((item, index) => (
          <li key={index}>
            <input
              className="enterprise-alenio-go-alert-input"
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={`Observation ${index + 1}`}
              maxLength={280}
            />
            <button
              type="button"
              className="walk-template-remove-item"
              disabled={items.length <= 1}
              onClick={() => removeItem(index)}
              aria-label={`Remove item ${index + 1}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {localErr || error ? (
        <p className="enterprise-alenio-go-alert-error" role="alert">
          {localErr || error}
        </p>
      ) : null}

      <button type="submit" className="walk-template-submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
