import {
  displayCategory,
  formatKioskTime,
  type KioskTaskItem,
  type KioskTaskState,
} from "./checklist-kiosk-types";

type Props = {
  index: number;
  item: KioskTaskItem;
  locationName: string;
  state: KioskTaskState;
  readOnly?: boolean;
  onSignerChange?: (name: string) => void;
  onSignOff?: () => void;
  onUnsign?: () => void;
  error?: string | null;
};

export function ChecklistKioskTaskRow({
  index,
  item,
  locationName,
  state,
  readOnly = false,
  onSignerChange,
  onSignOff,
  onUnsign,
  error,
}: Props) {
  const category = displayCategory(item, locationName);
  const showCategory = category.toLowerCase() !== locationName.trim().toLowerCase();
  const note = item.note?.trim() ?? "";
  const signedMeta =
    state.signed && state.signerName
      ? `${state.signerName}${state.signedAt ? ` · ${formatKioskTime(state.signedAt)}` : ""}`
      : "";

  return (
    <li
      className={`kiosk-task-row${state.signed ? " kiosk-task-row--complete" : ""}${note ? " kiosk-task-row--has-note" : ""}`}
      data-testid={`kiosk-task-${item.id}`}
    >
      <span className="kiosk-task-row__num" aria-hidden>
        {index}
      </span>
      <span
        className={`kiosk-task-row__check${state.signed ? " kiosk-task-row__check--done" : ""}`}
        aria-hidden
      >
        {state.signed ? "✓" : ""}
      </span>

      <div className="kiosk-task-row__content">
        <div className="kiosk-task-row__primary">
          <span className="kiosk-task-row__title">{item.title}</span>
          {showCategory ? <span className="kiosk-task-row__category">{category}</span> : null}
          {state.signed && !note ? <span className="kiosk-task-row__meta-inline">{signedMeta}</span> : null}
        </div>
        {note || (state.signed && signedMeta) ? (
          <p className="kiosk-task-row__sub">
            {note ? <span className="kiosk-task-row__note">{note}</span> : null}
            {note && state.signed && signedMeta ? <span className="kiosk-task-row__sub-sep"> · </span> : null}
            {state.signed && note ? <span className="kiosk-task-row__meta">{signedMeta}</span> : null}
          </p>
        ) : null}
        {error ? (
          <p className="kiosk-task-row__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="kiosk-task-row__actions">
        {state.signed ? (
          !readOnly ? (
            <button type="button" className="kiosk-task-row__undo-btn" onClick={() => onUnsign?.()}>
              Undo
            </button>
          ) : null
        ) : readOnly ? (
          <span className="kiosk-task-row__status kiosk-task-row__status--pending">—</span>
        ) : (
          <>
            <input
              id={`kiosk-signer-${item.id}`}
              className={`kiosk-task-row__input${error ? " kiosk-task-row__input--error" : ""}`}
              value={state.signerName}
              onChange={(e) => onSignerChange?.(e.target.value)}
              placeholder="Init."
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
              className="kiosk-task-row__sign-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSignOff?.()}
              aria-label={`Sign off ${item.title}`}
            >
              ✓
            </button>
          </>
        )}
      </div>
    </li>
  );
}
