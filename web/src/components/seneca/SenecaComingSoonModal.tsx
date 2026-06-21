import { useEffect, useState } from "react";
import { SenecaIcon } from "./SenecaShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SenecaComingSoonModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    const timer = window.setTimeout(() => setLoading(false), 1400);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="seneca-soon-backdrop" role="presentation" onClick={onClose}>
      <div
        className="seneca-soon-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-soon-title"
        aria-busy={loading}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="seneca-soon-close" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="seneca-soon-glow" aria-hidden />

        <div className={`seneca-soon-icon-wrap${loading ? " seneca-soon-icon-wrap--loading" : ""}`}>
          <SenecaIcon size={88} className="seneca-soon-icon" />
          {loading ? <span className="seneca-soon-spinner" aria-hidden /> : null}
        </div>

        {loading ? (
          <div className="seneca-soon-loading">
            <p className="seneca-soon-loading-text">Seneca is loading</p>
            <span className="seneca-soon-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : (
          <div className="seneca-soon-body">
            <p className="seneca-kicker seneca-soon-kicker">AI coaching assistant</p>
            <h2 id="seneca-soon-title" className="seneca-soon-title">
              Seneca — coming soon
            </h2>
            <p className="seneca-soon-sub">
              Your manager coaching copilot for check-ins, development plans, and better 1:1 conversations. We&apos;re
              putting the finishing touches on it.
            </p>
            <button type="button" className="seneca-soon-dismiss" onClick={onClose}>
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
