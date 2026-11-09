import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const GAP = 4;
const EDGE = 8;

/**
 * Floating surface pinned to an anchor, rendered in a portal so scroll areas
 * never clip it. Flips above the anchor when there is no room below and stays
 * inside the viewport horizontally. Closes on outside press and Escape.
 */
export function Popover({
  anchor,
  onClose,
  children,
  className = "al-popover",
  align = "end",
  matchWidth = false,
  role,
  ariaLabel,
  onKeyDown,
  id,
  testId,
}: {
  anchor: HTMLElement;
  onClose: (reason: "outside" | "escape") => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  matchWidth?: boolean;
  role?: string;
  ariaLabel?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  id?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ top: 0, left: 0, visibility: "hidden" });

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const rect = anchor.getBoundingClientRect();
      const width = matchWidth ? Math.max(rect.width, el.offsetWidth) : el.offsetWidth;
      const height = el.offsetHeight;
      const below = rect.bottom + GAP;
      const top = below + height > window.innerHeight - EDGE ? Math.max(EDGE, rect.top - GAP - height) : below;
      const wanted = align === "end" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, window.innerWidth - width - EDGE));
      setStyle({ top, left, minWidth: matchWidth ? rect.width : undefined, visibility: "visible" });
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, align, matchWidth]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose("outside");
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose("escape");
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      className={className}
      role={role}
      aria-label={ariaLabel}
      style={style}
      // Portal events still bubble through React; keep them off the row below.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      data-testid={testId}
    >
      {children}
    </div>,
    document.body,
  );
}

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';

/** Menu with roving keyboard focus. Focus returns to the anchor when closed by keyboard. */
export function Menu({
  anchor,
  onClose,
  label,
  children,
  align = "end",
  className,
  testId,
}: {
  anchor: HTMLElement;
  onClose: (refocus: boolean) => void;
  label?: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      box.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") onClose(false);
  };

  return (
    <Popover
      anchor={anchor}
      onClose={(reason) => onClose(reason === "escape")}
      className={`al-menu al-ds${className ? ` ${className}` : ""}`}
      align={align}
      role="menu"
      ariaLabel={label}
      onKeyDown={onKeyDown}
      testId={testId}
    >
      <div ref={box}>{children}</div>
    </Popover>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  tone,
  disabled,
  hint,
  testId,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
  hint?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`al-menu-item${tone === "danger" ? " al-menu-item--danger" : ""}`}
      disabled={disabled}
      title={hint}
      onClick={onSelect}
      data-testid={testId}
    >
      {icon ? <span className="al-menu-icon">{icon}</span> : null}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="al-menu-divider" role="separator" />;
}
