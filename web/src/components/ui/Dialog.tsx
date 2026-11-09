import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export type DialogSize = "sm" | "md" | "lg";

/**
 * Modal dialog: portal, backdrop, focus trap, focus restore. Escape, the close
 * button and backdrop presses call `onClose` unless `busy` (work in flight).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  busy = false,
  footer,
  children,
  initialFocus,
  dismissible = true,
  testId,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  busy?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  /** When false, Escape and backdrop presses do nothing (the dialog requires a choice). */
  dismissible?: boolean;
  testId?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const canClose = dismissible && !busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => {
      const el = panel.current;
      if (!el) return;
      const target =
        initialFocus?.current ??
        el.querySelector(".al-dialog-body")?.querySelector<HTMLElement>(FOCUSABLE) ??
        el.querySelector(".al-dialog-foot")?.querySelector<HTMLElement>(FOCUSABLE) ??
        el;
      target.focus();
    });
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (canClose) closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const el = panel.current;
    if (!el || !el.contains(document.activeElement)) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="al-dialog-backdrop al-ds"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && canClose) closeRef.current();
      }}
    >
      <div
        ref={panel}
        className={`al-dialog al-dialog--${size}${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid={testId}
      >
        <div className="al-dialog-head">
          <div className="al-dialog-heading">
            <h2 id={titleId} className="al-dialog-title">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="al-dialog-desc">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <button type="button" className="al-dialog-close" aria-label="Close" disabled={busy} onClick={() => closeRef.current()}>
              <X size={18} aria-hidden />
            </button>
          ) : null}
        </div>
        {children ? <div className="al-dialog-body">{children}</div> : null}
        {footer ? <div className="al-dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  testId?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      busy={busy}
      initialFocus={tone === "danger" ? cancel : undefined}
      testId={testId}
      footer={
        <>
          <Button ref={cancel} variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "destructive" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
