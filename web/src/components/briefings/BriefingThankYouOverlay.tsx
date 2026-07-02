import { useEffect } from "react";

type Props = {
  reviewerName?: string;
  onDone: () => void;
};

export function BriefingThankYouOverlay({ reviewerName, onDone }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3800);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="briefing-thankyou-overlay" role="status" aria-live="polite">
      <div className="briefing-thankyou-card briefing-thankyou-card--animate">
        <div className="briefing-thankyou-check" aria-hidden />
        <h3 className="briefing-thankyou-title">Thank you!</h3>
        <p className="briefing-thankyou-sub">
          {reviewerName ? `${reviewerName}, your sign-off was recorded.` : "Your sign-off was recorded."}
        </p>
        <p className="briefing-thankyou-hint">Returning to the top of the briefing…</p>
      </div>
    </div>
  );
}
