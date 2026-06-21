import { useEffect, useState } from "react";
import {
  createChecklistLocation,
  replaceChecklistLocationItems,
  updateChecklistLocation,
  type ChecklistLocationRow,
} from "../../lib/api";

type Props = {
  teamId: string;
  location: ChecklistLocationRow | null;
  onClose: () => void;
  onSaved: (saved: ChecklistLocationRow, wasCreate: boolean) => Promise<void>;
};

type ItemDraft = { title: string };

export function LocationChecklistEditorModal({ teamId, location, onClose, onSaved }: Props) {
  const isEdit = !!location;
  const [name, setName] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ title: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!location) {
      setName("");
      setItems([{ title: "" }]);
      setErr(null);
      return;
    }
    setName(location.name);
    setItems(location.items.length > 0 ? location.items.map((i) => ({ title: i.title })) : [{ title: "" }]);
    setErr(null);
  }, [location]);

  const trimmedItems = items.map((i) => i.title.trim()).filter(Boolean);

  const onSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedItems.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      let saved: ChecklistLocationRow;
      if (isEdit && location) {
        if (trimmedName !== location.name) {
          saved = await updateChecklistLocation(teamId, location.id, { name: trimmedName });
        } else {
          saved = location;
        }
        saved = await replaceChecklistLocationItems(
          teamId,
          location.id,
          trimmedItems.map((title) => ({ title })),
        );
        await onSaved(saved, false);
      } else {
        saved = await createChecklistLocation(teamId, {
          name: trimmedName,
          items: trimmedItems.map((title) => ({ title })),
        });
        await onSaved(saved, true);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save location.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="enterprise-modal-panel enterprise-checklist-editor-modal"
        role="dialog"
        aria-labelledby="checklist-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="checklist-editor-title" className="enterprise-modal-title">
          {isEdit ? "Edit location checklist" : "Add location checklist"}
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">Each location gets its own link and QR code for on-site use.</p>

        <label className="enterprise-muted enterprise-profile-label" htmlFor="checklist-location-name">
          Location name
        </label>
        <input
          id="checklist-location-name"
          className="auth-input enterprise-modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Front counter"
        />

        <div className="enterprise-checklist-editor-items-head">
          <span className="enterprise-muted enterprise-profile-label">Checklist items</span>
          <button
            type="button"
            className="enterprise-team-pill-btn"
            onClick={() => setItems((prev) => [...prev, { title: "" }])}
          >
            + Add item
          </button>
        </div>

        <ul className="enterprise-checklist-editor-items">
          {items.map((item, idx) => (
            <li key={idx}>
              <input
                className="auth-input enterprise-checklist-editor-item-input"
                value={item.title}
                placeholder={`Item ${idx + 1}`}
                onChange={(e) =>
                  setItems((prev) => prev.map((row, i) => (i === idx ? { title: e.target.value } : row)))
                }
              />
              {items.length > 1 ? (
                <button
                  type="button"
                  className="enterprise-checklist-editor-remove"
                  aria-label="Remove item"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {err ? (
          <p className="enterprise-form-error" role="alert">
            {err}
          </p>
        ) : null}

        <div className="enterprise-modal-actions">
          <button type="button" className="enterprise-inline-link" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-modal-primary-btn"
            disabled={busy || !name.trim() || trimmedItems.length === 0}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create location"}
          </button>
        </div>
      </div>
    </div>
  );
}
