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

type TaskDraft = { title: string; category: string };

export function LocationChecklistEditorModal({ teamId, location, onClose, onSaved }: Props) {
  const isEdit = !!location;
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([{ title: "", category: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!location) {
      setName("");
      setTasks([{ title: "", category: "" }]);
      setErr(null);
      return;
    }
    setName(location.name);
    setTasks(
      location.items.length > 0
        ? location.items.map((i) => ({ title: i.title, category: i.category ?? "" }))
        : [{ title: "", category: "" }],
    );
    setErr(null);
  }, [location]);

  const trimmedTasks = tasks
    .map((t) => ({ title: t.title.trim(), category: t.category.trim() || null }))
    .filter((t) => t.title);

  const onSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
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
        saved = await replaceChecklistLocationItems(teamId, location.id, trimmedTasks);
        await onSaved(saved, false);
      } else {
        saved = await createChecklistLocation(teamId, {
          name: trimmedName,
          items: trimmedTasks,
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
          {isEdit ? "Edit checklist" : "New checklist"}
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">
          Add tasks for this checklist. Associates pick it from your workspace checklist page on iPad.
        </p>

        <label className="enterprise-muted enterprise-profile-label" htmlFor="checklist-location-name">
          Checklist name
        </label>
        <input
          id="checklist-location-name"
          className="auth-input enterprise-modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Opening duties"
        />

        <div className="enterprise-checklist-editor-items-head">
          <span className="enterprise-muted enterprise-profile-label">Tasks</span>
          <button
            type="button"
            className="enterprise-team-pill-btn"
            onClick={() => setTasks((prev) => [...prev, { title: "", category: "" }])}
          >
            + Add task
          </button>
        </div>

        <ul className="enterprise-checklist-editor-items enterprise-checklist-editor-items--tasks">
          {tasks.map((task, idx) => (
            <li key={idx}>
              <span className="enterprise-checklist-editor-task-num">{idx + 1}</span>
              <div className="enterprise-checklist-editor-task-fields">
                <input
                  className="auth-input enterprise-checklist-editor-item-input"
                  value={task.title}
                  placeholder={`Task ${idx + 1}`}
                  onChange={(e) =>
                    setTasks((prev) => prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row)))
                  }
                />
                <input
                  className="auth-input enterprise-checklist-editor-category-input"
                  value={task.category}
                  placeholder="Area (optional) e.g. Kitchen"
                  onChange={(e) =>
                    setTasks((prev) => prev.map((row, i) => (i === idx ? { ...row, category: e.target.value } : row)))
                  }
                />
              </div>
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
              {trimmedTasks.map((task, idx) => (
                <li key={`${idx}-${task.title}`}>
                  {task.title}
                  {task.category ? <span className="enterprise-muted"> · {task.category}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="enterprise-muted enterprise-checklist-editor-hint">
            No tasks yet — you can save now and add tasks later. One workspace QR covers every checklist.
          </p>
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
            disabled={busy || !name.trim()}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : isEdit ? "Save checklist" : "Save checklist"}
          </button>
        </div>
      </div>
    </div>
  );
}
