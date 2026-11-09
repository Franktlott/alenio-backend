import { Button, Dialog } from "../ui";

type Props = {
  open: boolean;
  title: string;
  message: string;
  items?: string[];
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
  items,
  confirmLabel,
  confirmTone = "primary",
  cancelLabel = "Cancel",
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      busy={busy}
      testId="task-prompt"
      footer={
        <>
          {cancelLabel ? (
            <Button variant="secondary" disabled={busy} onClick={onClose} data-testid="task-prompt-cancel">
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            variant={confirmTone === "danger" ? "destructive" : "primary"}
            loading={busy}
            onClick={onConfirm}
            data-testid="task-prompt-confirm"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {items && items.length > 0 ? (
        <ul className="al-dialog-list">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}
