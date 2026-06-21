import { useEffect, useRef, useState } from "react";
import { formatKioskTime, type KioskTaskItem, type KioskTaskState } from "./checklist-kiosk-types";

type Props = {
  index: number;
  item: KioskTaskItem;
  state: KioskTaskState;
  readOnly?: boolean;
  onSignerChange?: (name: string) => void;
  onSignOff?: () => void;
  onUnsign?: () => void;
  error?: string | null;
};

export function ChecklistKioskTaskCard({
  index,
  item,
  state,
  readOnly = false,
  onSignerChange,
  onSignOff,
  onUnsign,
  error,
}: Props) {
  const [signing, setSigning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const note = item.note?.trim() ?? "";
  const signedMeta =
    state.signed && state.signerName
      ? `${state.signerName}${state.signedAt ? ` · ${formatKioskTime(state.signedAt)}` : ""}`
      : "";

  useEffect(() => {
    if (signing) inputRef.current?.focus();
  }, [signing]);

  const beginSignOff = () => {
    if (readOnly || state.signed) return;
    setSigning(true);
  };

  const confirmSignOff = () => {
    onSignOff?.();
    setSigning(false);
  };

  return (
    <li
      className={`kiosk-task-card${state.signed ? " kiosk-task-card--complete" : ""}`}
      data-testid={`kiosk-task-${item.id}`}
    >
      <div className="kiosk-task-card__top">
        <span className="kiosk-task-card__index" aria-hidden>
          {index}
        </span>
        <div className="kiosk-task-card__body">
          <h3 className="kiosk-task-card__title">{item.title}</h3>
          {note ? <p className="kiosk-task-card__note">{note}</p> : null}
          {state.signed && signedMeta ? <p className="kiosk-task-card__signed">{signedMeta}</p> : null}
          {error ? (
            <p className="kiosk-task-card__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <span
          className={`kiosk-task-card__badge${state.signed ? " kiosk-task-card__badge--done" : ""}`}
          aria-hidden
        >
          {state.signed ? "Complete" : "Pending"}
        </span>
      </div>

      <div className="kiosk-task-card__action">
        {state.signed ? (
          !readOnly ? (
            <button type="button" className="kiosk-task-card__undo" onClick={() => onUnsign?.()}>
              Undo
            </button>
          ) : null
        ) : signing && !readOnly ? (
          <div className="kiosk-task-card__sign-form">
            <input
              ref={inputRef}
              className={`kiosk-task-card__input${error ? " kiosk-task-card__input--error" : ""}`}
              value={state.signerName}
              onChange={(e) => onSignerChange?.(e.target.value)}
              placeholder="Your initials"
              autoComplete="name"
              inputMode="text"
              aria-label={`Initials for ${item.title}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmSignOff();
                if (e.key === "Escape") setSigning(false);
              }}
            />
            <button type="button" className="kiosk-task-card__confirm" onClick={confirmSignOff}>
              Done
            </button>
            <button type="button" className="kiosk-task-card__cancel" onClick={() => setSigning(false)}>
              Cancel
            </button>
          </div>
        ) : readOnly ? (
          <span className="kiosk-task-card__readonly">Preview only</span>
        ) : (
          <button type="button" className="kiosk-task-card__signoff" onClick={beginSignOff}>
            Sign off
          </button>
        )}
      </div>
    </li>
  );
}
