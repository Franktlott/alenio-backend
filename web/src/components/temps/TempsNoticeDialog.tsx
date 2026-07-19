import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { TempsButton } from "./TempsButton";

export type TempsNoticeTone = "info" | "warning" | "danger";

export type TempsNoticeState = {
  title: string;
  message?: string;
  items?: string[];
  tone?: TempsNoticeTone;
  confirmLabel?: string;
};

type Props = {
  open: boolean;
  title: string;
  message?: string;
  items?: string[];
  tone?: TempsNoticeTone;
  confirmLabel?: string;
  onClose: () => void;
};

export function TempsNoticeDialog({
  open,
  title,
  message,
  items,
  tone = "warning",
  confirmLabel = "Got it",
  onClose,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const hasItems = Boolean(items?.length);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="temps-notice" role="presentation" onClick={onClose}>
      <div
        className={`temps-notice-card temps-notice-card--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="temps-notice-body">
          <img
            className="temps-notice-logo"
            src="/AlenioTemp.png"
            alt=""
            width={192}
            height={192}
            aria-hidden
          />
          <div className="temps-notice-copy">
            <h2 id={titleId}>{title}</h2>
            {message ? <p id={hasItems ? undefined : descId}>{message}</p> : null}
            {hasItems ? (
              <ul id={descId} className="temps-notice-list">
                {items!.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="temps-notice-actions">
          <TempsButton variant="primary" onClick={onClose}>
            {confirmLabel}
          </TempsButton>
        </div>
      </div>
    </div>
  );
}

export function useTempsNotice() {
  const [notice, setNotice] = useState<TempsNoticeState | null>(null);

  const showNotice = useCallback((next: TempsNoticeState) => {
    setNotice(next);
  }, []);

  const closeNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const noticeDialog: ReactNode = (
    <TempsNoticeDialog
      open={Boolean(notice)}
      title={notice?.title ?? ""}
      message={notice?.message}
      items={notice?.items}
      tone={notice?.tone}
      confirmLabel={notice?.confirmLabel}
      onClose={closeNotice}
    />
  );

  return { showNotice, closeNotice, noticeDialog };
}
