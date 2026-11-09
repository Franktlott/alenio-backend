import { MoreHorizontal } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Menu, MenuItem } from "./Menu";

export type RowAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
  /** Tooltip, e.g. why the action is disabled. */
  hint?: string;
};

/** Trailing "…" button with a menu of row actions. */
export function RowActions({ actions, label = "More actions", testId }: { actions: RowAction[]; label?: string; testId?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`al-row-menu-btn${open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
      </button>
      {open && trigger.current ? (
        <Menu anchor={trigger.current} onClose={close} label={label}>
          {actions.map((a) => (
            <MenuItem
              key={a.id}
              icon={a.icon}
              tone={a.tone}
              disabled={a.disabled}
              hint={a.hint}
              onSelect={() => {
                close(true);
                a.onSelect();
              }}
              testId={testId ? `${testId}-${a.id}` : undefined}
            >
              {a.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
}
