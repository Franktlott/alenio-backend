import type { RecurrenceScope } from "../lib/recurring-task";
import { Button, Dialog } from "./ui";

type Props = {
  open: boolean;
  mode: "delete" | "edit";
  onClose: () => void;
  onChoose: (scope: RecurrenceScope) => void;
  busy?: boolean;
};

export function RecurringTaskScopeModal({ open, mode, onClose, onChoose, busy = false }: Props) {
  const title = mode === "delete" ? "Delete recurring task?" : "Update recurring task?";
  const body =
    mode === "delete"
      ? "This task is part of a repeating series. Delete only this occurrence, or the entire series including future tasks."
      : "This task is part of a repeating series. Apply changes to only this occurrence, or to this and all upcoming tasks in the series.";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onChoose("task")}>
            This task only
          </Button>
          <Button variant={mode === "delete" ? "destructive" : "primary"} disabled={busy} onClick={() => onChoose("series")}>
            Entire series
          </Button>
        </>
      }
    />
  );
}
