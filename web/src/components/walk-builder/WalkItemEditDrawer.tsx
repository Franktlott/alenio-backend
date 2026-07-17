import { useEffect, useState } from "react";
import type { WalkItem, WalkItemType } from "../../lib/walks/types";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";

type Props = {
  item: WalkItem | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (patch: {
    title: string;
    description: string | null;
    instructions: string | null;
    required: boolean;
    config: Record<string, unknown>;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

function typeLabel(type: WalkItemType) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

export function WalkItemEditDrawer({ item, open, busy, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [required, setRequired] = useState(true);
  const [configJson, setConfigJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description ?? "");
    setInstructions(item.instructions ?? "");
    setRequired(item.required);
    setConfigJson(JSON.stringify(item.config ?? {}, null, 2));
    setError(null);
  }, [item]);

  if (!open || !item) return null;

  async function save() {
    setError(null);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      setError("Config must be valid JSON.");
      return;
    }
    await onSave({
      title: title.trim() || item!.title,
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      required,
      config,
    });
  }

  return (
    <div className="wb-drawer" role="dialog" aria-modal="true" aria-labelledby="wb-drawer-title">
      <button type="button" className="wb-drawer-backdrop" aria-label="Close" onClick={onClose} />
      <div className="wb-drawer-panel">
        <header className="wb-drawer-head">
          <div>
            <p className="wb-drawer-kicker">{typeLabel(item.type)}</p>
            <h2 id="wb-drawer-title">Edit item</h2>
          </div>
          <button type="button" className="wb-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? <p className="wb-drawer-error">{error}</p> : null}

        <label className="wb-field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="wb-field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>
        <label className="wb-field">
          <span>Instructions for associates</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
        </label>
        <label className="wb-check">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        <label className="wb-field">
          <span>Type config (JSON)</span>
          <textarea
            className="wb-field-mono"
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={8}
          />
        </label>

        <div className="wb-drawer-actions">
          <button type="button" className="wb-btn wb-btn--danger" disabled={busy} onClick={() => void onDelete()}>
            Delete
          </button>
          <div className="wb-drawer-actions-right">
            <button type="button" className="wb-btn wb-btn--ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="wb-btn wb-btn--primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
