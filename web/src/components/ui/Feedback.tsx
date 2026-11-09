import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ---------- Spinner / LoadingState ---------- */

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="al-spinner" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Loader2 size={size} strokeWidth={2.2} className="al-btn-spin" aria-hidden />
    </span>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="al-loading" role="status">
      <Loader2 size={20} strokeWidth={2.2} className="al-btn-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/* ---------- Tooltip ---------- */

export function Tooltip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const above = a.top - t.height - 6;
    const top = side === "top" && above > 4 ? above : a.bottom + 6;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    setStyle({ top, left, visibility: "visible" });
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!label) return <>{children}</>;

  return (
    <span
      ref={anchor}
      className="al-tooltip-anchor"
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open
        ? createPortal(
            <span ref={tip} id={id} role="tooltip" className="al-tooltip al-ds" style={style}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/* ---------- Toasts ---------- */

export type ToastTone = "success" | "error" | "warning" | "info" | "loading";

export type ToastInput = {
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. Loading toasts never auto-dismiss. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

type ToastApi = {
  show: (toast: ToastInput) => number;
  update: (id: number, toast: ToastInput) => void;
  dismiss: (id: number) => void;
  success: (title: ReactNode, description?: ReactNode) => number;
  error: (title: ReactNode, description?: ReactNode) => number;
};

const noop: ToastApi = {
  show: () => 0,
  update: () => {},
  dismiss: () => {},
  success: () => 0,
  error: () => 0,
};

const ToastContext = createContext<ToastApi>(noop);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} aria-hidden />,
  error: <AlertCircle size={18} aria-hidden />,
  warning: <AlertTriangle size={18} aria-hidden />,
  info: <Info size={18} aria-hidden />,
  loading: <Loader2 size={18} className="al-btn-spin" aria-hidden />,
};

const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const schedule = useCallback(
    (item: ToastItem) => {
      const old = timers.current.get(item.id);
      if (old) window.clearTimeout(old);
      timers.current.delete(item.id);
      const duration = item.tone === "loading" ? 0 : (item.duration ?? (item.tone === "error" ? 6000 : 4000));
      if (duration > 0) timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), duration));
    },
    [dismiss],
  );

  const show = useCallback(
    (toast: ToastInput) => {
      const item: ToastItem = { ...toast, tone: toast.tone ?? "info", id: nextId.current++ };
      setToasts((list) => [...list, item].slice(-MAX_TOASTS));
      schedule(item);
      return item.id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, toast: ToastInput) => {
      const item: ToastItem = { ...toast, tone: toast.tone ?? "info", id };
      setToasts((list) => (list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [...list, item].slice(-MAX_TOASTS)));
      schedule(item);
    },
    [schedule],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      update,
      dismiss,
      success: (title, description) => show({ tone: "success", title, description }),
      error: (title, description) => show({ tone: "error", title, description }),
    }),
    [show, update, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="al-toast-region al-ds" aria-live="polite" aria-relevant="additions text">
          {toasts.map((t) => (
            <div key={t.id} className={`al-toast al-toast--${t.tone}`} role={t.tone === "error" ? "alert" : "status"} data-testid="al-toast">
              <span className="al-toast-icon">{TONE_ICON[t.tone]}</span>
              <div className="al-toast-copy">
                <p className="al-toast-title">{t.title}</p>
                {t.description ? <p className="al-toast-desc">{t.description}</p> : null}
              </div>
              {t.tone !== "loading" ? (
                <button type="button" className="al-toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                  <X size={16} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
