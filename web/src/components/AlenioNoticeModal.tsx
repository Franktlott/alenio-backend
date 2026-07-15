type NoticeTone = "info" | "success" | "error";

type Props = {
  open: boolean;
  title: string;
  message: string;
  tone?: NoticeTone;
  confirmLabel?: string;
  onClose: () => void;
};

export function AlenioNoticeModal({
  open,
  title,
  message,
  tone = "info",
  confirmLabel = "Got it",
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="alenio-notice-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`alenio-notice-modal alenio-notice-modal--${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alenio-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="alenio-notice-brand" aria-hidden>
          <img src="/icon.png" alt="" width={40} height={40} />
        </div>
        <p className="alenio-notice-kicker">Alenio</p>
        <h2 id="alenio-notice-title" className="alenio-notice-title">
          {title}
        </h2>
        <p className="alenio-notice-message">{message}</p>
        <button type="button" className="alenio-notice-confirm" onClick={onClose}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
