import { outlookErrorTitle } from "../lib/outlook-calendar-errors";

type Props = {
  variant: "success" | "error";
  title?: string;
  message: string;
};

function IconSuccess() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconError() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function OutlookCalendarAlert({ variant, title, message }: Props) {
  const resolvedTitle =
    title ?? (variant === "error" ? outlookErrorTitle(message) : "Outlook connected");

  return (
    <div
      className={`enterprise-outlook-alert enterprise-outlook-alert--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <span className="enterprise-outlook-alert-icon" aria-hidden>
        {variant === "success" ? <IconSuccess /> : <IconError />}
      </span>
      <div className="enterprise-outlook-alert-copy">
        <p className="enterprise-outlook-alert-title">{resolvedTitle}</p>
        <p className="enterprise-outlook-alert-message">{message}</p>
      </div>
    </div>
  );
}
