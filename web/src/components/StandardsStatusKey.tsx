import { useState } from "react";
import {
  STANDARDS_BADGE_LEGEND,
  standardsBadgeClassName,
  type StandardsBadgeVariant,
} from "../lib/workplace-standards";

const STANDARDS_STATUS_KEY_ORDER: StandardsBadgeVariant[] = [
  "on_track",
  "check_in_due_soon",
  "overdue_check_in",
  "no_check_in",
  "needs_active_goals",
];

function IconInfoCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </svg>
  );
}

type Props = {
  className?: string;
};

export function StandardsStatusKey({ className }: Props) {
  const [open, setOpen] = useState(false);
  const items = STANDARDS_STATUS_KEY_ORDER.map((variant) =>
    STANDARDS_BADGE_LEGEND.find((entry) => entry.variant === variant),
  ).filter((entry): entry is (typeof STANDARDS_BADGE_LEGEND)[number] => Boolean(entry));

  return (
    <>
      <button
        type="button"
        className={`enterprise-standards-status-key-btn${className ? ` ${className}` : ""}`}
        aria-label="Open status key"
        title="Status key"
        onClick={() => setOpen(true)}
      >
        <IconInfoCircle />
      </button>

      {open ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="enterprise-modal-sheet enterprise-standards-status-key-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="standards-status-key-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="enterprise-task-modal-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <header className="enterprise-standards-status-key-head">
              <p className="enterprise-overview-kicker">Workplace</p>
              <h3 id="standards-status-key-title" className="enterprise-standards-status-key-title">
                Status key
              </h3>
              <p className="enterprise-muted enterprise-standards-status-key-sub">
                What each badge means for check-ins and development goals.
              </p>
            </header>

            <ul className="enterprise-standards-status-key-list">
              {items.map((item) => (
                <li key={item.variant}>
                  <span className={standardsBadgeClassName(item.variant)}>{item.label}</span>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>

            <footer className="enterprise-standards-status-key-footer">
              <button type="button" className="enterprise-btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
