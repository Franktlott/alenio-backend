type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger" | "success" | "warning";
  cancelLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function TaskPromptModal({
  open,
  title,
  message,
  confirmLabel,
  confirmTone = "primary",
  cancelLabel = "Cancel",
  busy,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  const confirmClass =
    confirmTone === "danger"
      ? "enterprise-task-prompt-confirm enterprise-task-prompt-confirm--danger"
      : confirmTone === "success"
        ? "enterprise-task-prompt-confirm enterprise-task-prompt-confirm--success"
        : confirmTone === "warning"
          ? "enterprise-task-prompt-confirm enterprise-task-prompt-confirm--warning"
          : "enterprise-task-prompt-confirm enterprise-task-prompt-confirm--primary";

  return (
    <div className="enterprise-task-modal-backdrop enterprise-task-prompt-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div className="enterprise-task-prompt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="enterprise-task-prompt-title">{title}</h3>
        <p className="enterprise-task-prompt-copy">{message}</p>
        <div className="enterprise-task-prompt-actions">
          {cancelLabel ? (
            <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={busy} onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" className={`enterprise-task-modal-btn ${confirmClass}`} disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
