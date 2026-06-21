import { formatKioskTime, type KioskTaskItem, type KioskTaskState } from "./checklist-kiosk-types";

type Props = {
  item: KioskTaskItem;
  index: number;
  state: KioskTaskState;
  readOnly?: boolean;
  onSignerChange?: (name: string) => void;
  onSignOff?: () => void;
  error?: string | null;
};

export function ChecklistKioskTaskRow({
  item,
  index,
  state,
  readOnly = false,
  onSignerChange,
  onSignOff,
  error,
}: Props) {
  return (
    <li
      className={`kiosk-task-row${state.signed ? " kiosk-task-row--complete" : ""}`}
      data-testid={`kiosk-task-${index}`}
    >
      <div className="kiosk-task-row__main">
        <span className="kiosk-task-row__index">{String(index + 1).padStart(2, "0")}</span>
        <div className="kiosk-task-row__text">
          <p className="kiosk-task-row__title">{item.title}</p>
          {state.signed && state.signedAt ? (
            <p className="kiosk-task-row__meta">Completed {formatKioskTime(state.signedAt)}</p>
          ) : null}
        </div>
      </div>

      <div className="kiosk-task-row__signoff">
        {state.signed ? (
          <div className="kiosk-task-row__done" aria-label={`Signed by ${state.signerName}`}>
            <span className="kiosk-task-row__initials">{(state.signerName || "?").slice(0, 3).toUpperCase()}</span>
            <span className="kiosk-task-row__check" aria-hidden>
              ✓
            </span>
          </div>
        ) : readOnly ? (
          <span className="kiosk-task-row__preview">Initials</span>
        ) : (
          <>
            <input
              id={`kiosk-signer-${item.id}`}
              className={`kiosk-task-row__input${error ? " kiosk-task-row__input--error" : ""}`}
              value={state.signerName}
              onChange={(e) => onSignerChange?.(e.target.value)}
              placeholder="Initials"
              autoComplete="name"
              inputMode="text"
              aria-label={`Initials for ${item.title}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSignOff?.();
              }}
              onBlur={() => {
                if (state.signerName.trim()) onSignOff?.();
              }}
            />
            <button
              type="button"
              className="kiosk-task-row__complete-btn"
              aria-label={`Mark ${item.title} complete`}
              onClick={() => onSignOff?.()}
            >
              ✓
            </button>
          </>
        )}
      </div>

      {error ? (
        <p className="kiosk-task-row__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
