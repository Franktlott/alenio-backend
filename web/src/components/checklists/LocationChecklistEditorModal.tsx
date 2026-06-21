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

type TaskDraft = { title: string };

export function LocationChecklistEditorModal({ teamId, location, onClose, onSaved }: Props) {
  const isEdit = !!location;
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([{ title: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!location) {
      setName("");
      setTasks([{ title: "" }]);
      setErr(null);
      return;
    }
    setName(location.name);
    setTasks(location.items.length > 0 ? location.items.map((i) => ({ title: i.title })) : [{ title: "" }]);
    setErr(null);
  }, [location]);

  const trimmedTasks = tasks.map((t) => t.title.trim()).filter(Boolean);

  const onSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedTasks.length === 0 || busy) return;
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
          trimmedTasks.map((title) => ({ title })),
        );
        await onSaved(saved, false);
      } else {
        saved = await createChecklistLocation(teamId, {
          name: trimmedName,
          items: trimmedTasks.map((title) => ({ title })),
        });
        await onSaved(saved, true);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save checklist.");
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
          {isEdit ? "Edit location checklist" : "Create location checklist"}
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">
          Add the location name and every task below, then save once. Staff will sign off tasks on the Alenio checklist page.
        </p>

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
          <span className="enterprise-muted enterprise-profile-label">Tasks</span>
          <button
            type="button"
            className="enterprise-team-pill-btn"
            onClick={() => setTasks((prev) => [...prev, { title: "" }])}
          >
            + Add task
          </button>
        </div>

        <ul className="enterprise-checklist-editor-items">
          {tasks.map((task, idx) => (
            <li key={idx}>
              <span className="enterprise-checklist-editor-task-num">{idx + 1}</span>
              <input
                className="auth-input enterprise-checklist-editor-item-input"
                value={task.title}
                placeholder={`Task ${idx + 1}`}
                onChange={(e) =>
                  setTasks((prev) => prev.map((row, i) => (i === idx ? { title: e.target.value } : row)))
                }
              />
              {tasks.length > 1 ? (
                <button
                  type="button"
                  className="enterprise-checklist-editor-remove"
                  aria-label="Remove task"
                  onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {trimmedTasks.length > 0 ? (
          <div className="enterprise-checklist-editor-preview">
            <p className="enterprise-checklist-editor-preview-label">
              {trimmedTasks.length} task{trimmedTasks.length === 1 ? "" : "s"} ready to save
            </p>
            <ol className="enterprise-checklist-editor-preview-list">
              {trimmedTasks.map((title, idx) => (
                <li key={`${idx}-${title}`}>{title}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="enterprise-muted enterprise-checklist-editor-hint">Add at least one task before saving.</p>
        )}

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
            disabled={busy || !name.trim() || trimmedTasks.length === 0}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : isEdit ? "Save checklist" : "Save checklist & get link"}
          </button>
        </div>
      </div>
    </div>
  );
}
