import type { RecurrenceScope } from "../lib/recurring-task";

type Props = {
  open: boolean;
  mode: "delete" | "edit";
  onClose: () => void;
  onChoose: (scope: RecurrenceScope) => void;
  busy?: boolean;
};

export function RecurringTaskScopeModal({ open, mode, onClose, onChoose, busy }: Props) {
  if (!open) return null;

  const title = mode === "delete" ? "Delete recurring task?" : "Update recurring task?";
  const body =
    mode === "delete"
      ? "This task is part of a repeating series. Delete only this occurrence, or the entire series including future tasks."
      : "This task is part of a repeating series. Apply changes to only this occurrence, or to this and all upcoming tasks in the series.";

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="enterprise-recurring-scope-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-scope-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="recurring-scope-title" className="enterprise-recurring-scope-title">
          {title}
        </h3>
        <p className="enterprise-recurring-scope-copy">{body}</p>
        <div className="enterprise-recurring-scope-actions">
          <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
            disabled={busy}
            onClick={() => onChoose("task")}
          >
            This task only
          </button>
          <button
            type="button"
            className={`enterprise-task-modal-btn${mode === "delete" ? " enterprise-recurring-scope-danger" : " enterprise-task-modal-btn-primary"}`}
            disabled={busy}
            onClick={() => onChoose("series")}
          >
            Entire series
          </button>
        </div>
      </div>
    </div>
  );
}
