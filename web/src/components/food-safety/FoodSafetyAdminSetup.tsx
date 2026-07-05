import { useState } from "react";
import type { HaccpTemplateRow } from "../../lib/food-safety-api";

type Props = {
  templates: HaccpTemplateRow[];
  busy?: boolean;
  onSeed: () => Promise<void>;
  onCreate: (payload: {
    name: string;
    kind: string;
    workplace: string;
    windowStart: string;
    windowEnd: string;
    dueLabel: string;
    items: Array<{ label: string; maxTempF?: number | null; minTempF?: number | null }>;
  }) => Promise<void>;
};

export function FoodSafetyAdminSetup({ templates, busy, onSeed, onCreate }: Props) {
  const [name, setName] = useState("");
  const [workplace, setWorkplace] = useState("Kitchen");
  const [dueLabel, setDueLabel] = useState("Due Now");
  const [windowStart, setWindowStart] = useState("06:00");
  const [windowEnd, setWindowEnd] = useState("10:00");
  const [itemsText, setItemsText] = useState("Turkey|41\nHam|41");
  const [error, setError] = useState<string | null>(null);

  async function saveTemplate() {
    setError(null);
    const items = itemsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, temp] = line.split("|").map((p) => p.trim());
        const maxTempF = temp ? Number(temp) : null;
        return { label, maxTempF: Number.isFinite(maxTempF) ? maxTempF : null };
      });
    if (!name.trim() || items.length === 0) {
      setError("Add a template name and at least one item.");
      return;
    }
    await onCreate({
      name: name.trim(),
      kind: "custom",
      workplace: workplace.trim(),
      windowStart,
      windowEnd,
      dueLabel: dueLabel.trim(),
      items,
    });
    setName("");
  }

  return (
    <div className="fs-admin">
      <header className="fs-admin-head">
        <h2>Food safety setup</h2>
        <p className="enterprise-muted">
          Define temp check templates, due windows, and item temperature ranges for each location.
        </p>
        {templates.length === 0 ? (
          <button type="button" className="enterprise-alenio-go-link-btn" disabled={busy} onClick={() => void onSeed()}>
            Load starter templates
          </button>
        ) : null}
      </header>

      <div className="fs-admin-grid">
        <section className="fs-admin-card">
          <h3>Create template</h3>
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opening Temps" />
          </label>
          <label>
            <span>Location</span>
            <input value={workplace} onChange={(e) => setWorkplace(e.target.value)} />
          </label>
          <label>
            <span>Due label</span>
            <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value)} />
          </label>
          <div className="fs-admin-row">
            <label>
              <span>Window start</span>
              <input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </label>
            <label>
              <span>Window end</span>
              <input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </label>
          </div>
          <label>
            <span>Items (one per line: Name|MaxTemp)</span>
            <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={6} />
          </label>
          {error ? <p className="fs-guided-error">{error}</p> : null}
          <button type="button" className="fs-guided-primary" disabled={busy} onClick={() => void saveTemplate()}>
            Save template
          </button>
        </section>

        <section className="fs-admin-card">
          <h3>Active templates ({templates.length})</h3>
          {templates.length === 0 ? (
            <p className="enterprise-muted">No templates yet. Load starters or create your own.</p>
          ) : (
            <ul className="fs-admin-template-list">
              {templates.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong>
                  <span>
                    {t.workplace} · {t.itemCount} items · {t.dueLabel ?? "No due label"}
                  </span>
                  <span className="fs-admin-template-meta">
                    {t.windowStart}–{t.windowEnd} · Bluetooth {t.bluetoothMode}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
