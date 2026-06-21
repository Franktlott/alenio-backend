import { displayCategory, formatKioskTime, type KioskTaskItem, type KioskTaskState } from "./checklist-kiosk-types";

type Props = {
  item: KioskTaskItem;
  index: number;
  locationName: string;
  state: KioskTaskState;
  readOnly?: boolean;
  onSignerChange?: (name: string) => void;
  onSignOff?: () => void;
  error?: string | null;
};

export function ChecklistKioskTaskCard({
  item,
  index,
  locationName,
  state,
  readOnly = false,
  onSignerChange,
  onSignOff,
  error,
}: Props) {
  const area = displayCategory(item, locationName);

  return (
    <article
      className={`kiosk-task-card${state.signed ? " kiosk-task-card--complete" : ""}`}
      data-testid={`kiosk-task-${index}`}
    >
      <div className="kiosk-task-card__top">
        <span className="kiosk-task-card__index">{String(index + 1).padStart(2, "0")}</span>
        <span className={`kiosk-task-card__badge${state.signed ? " kiosk-task-card__badge--complete" : ""}`}>
          {state.signed ? "Complete" : "Pending"}
        </span>
      </div>

      <p className="kiosk-task-card__area">{area}</p>
      <h2 className="kiosk-task-card__title">{item.title}</h2>

      {state.signed ? (
        <div className="kiosk-task-card__done">
          <div className="kiosk-task-card__avatar" aria-hidden>
            {(state.signerName || "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="kiosk-task-card__signed-by">
              Signed by <strong>{state.signerName}</strong>
            </p>
            {state.signedAt ? (
              <p className="kiosk-task-card__signed-at">Completed at {formatKioskTime(state.signedAt)}</p>
            ) : null}
          </div>
        </div>
      ) : readOnly ? (
        <div className="kiosk-task-card__preview-note">Associates sign off here on the iPad</div>
      ) : (
        <>
          <label className="kiosk-task-card__label" htmlFor={`kiosk-signer-${item.id}`}>
            Initials or name
          </label>
          <input
            id={`kiosk-signer-${item.id}`}
            className="kiosk-task-card__input"
            value={state.signerName}
            onChange={(e) => onSignerChange?.(e.target.value)}
            placeholder="e.g. JM or Jordan"
            autoComplete="name"
            inputMode="text"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSignOff?.();
            }}
          />
          {error ? (
            <p className="kiosk-task-card__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="kiosk-task-card__sign-btn" onClick={() => onSignOff?.()}>
            Sign Off
          </button>
        </>
      )}
    </article>
  );
}
