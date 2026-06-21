import {
  displayCategory,
  formatKioskTime,
  type KioskTaskItem,
  type KioskTaskState,
} from "./checklist-kiosk-types";
import { KioskCategoryIcon } from "./kiosk-category-icon";

type Props = {
  item: KioskTaskItem;
  locationName: string;
  state: KioskTaskState;
  readOnly?: boolean;
  onSignerChange?: (name: string) => void;
  onSignOff?: () => void;
  error?: string | null;
};

export function ChecklistKioskTaskRow({
  item,
  locationName,
  state,
  readOnly = false,
  onSignerChange,
  onSignOff,
  error,
}: Props) {
  const category = displayCategory(item, locationName);

  return (
    <li
      className={`kiosk-task-row${state.signed ? " kiosk-task-row--complete" : ""}`}
      data-testid={`kiosk-task-${item.id}`}
    >
      <KioskCategoryIcon category={category} />

      <div className="kiosk-task-row__body">
        <div className="kiosk-task-row__head">
          <div className="kiosk-task-row__text">
            <p className="kiosk-task-row__category">{category}</p>
            <p className="kiosk-task-row__title">{item.title}</p>
          </div>
          <span
            className={`kiosk-task-row__badge${state.signed ? " kiosk-task-row__badge--complete" : " kiosk-task-row__badge--pending"}`}
          >
            {state.signed ? "Complete" : "Pending"}
          </span>
        </div>

        <div className="kiosk-task-row__signoff">
          {state.signed ? (
            <>
              <div className="kiosk-task-row__signed">
                <span className="kiosk-task-row__signed-label">Signed off by</span>
                <div className="kiosk-task-row__signed-row">
                  <span className="kiosk-task-row__avatar" aria-hidden>
                    {(state.signerName || "?")
                      .split(/\s+/)
                      .map((p) => p.charAt(0))
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <p className="kiosk-task-row__signed-name">{state.signerName}</p>
                    {state.signedAt ? (
                      <p className="kiosk-task-row__signed-at">{formatKioskTime(state.signedAt)}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="kiosk-task-row__check-done" aria-hidden>
                ✓
              </div>
            </>
          ) : readOnly ? (
            <button type="button" className="kiosk-task-row__sign-btn" disabled>
              Sign Off
            </button>
          ) : (
            <>
              <input
                id={`kiosk-signer-${item.id}`}
                className={`kiosk-task-row__input${error ? " kiosk-task-row__input--error" : ""}`}
                value={state.signerName}
                onChange={(e) => onSignerChange?.(e.target.value)}
                placeholder="Initials or name"
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
              >
                Sign Off
              </button>
            </>
          )}
        </div>

        {error ? (
          <p className="kiosk-task-row__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
