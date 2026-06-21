type Props = {
  /** Sidebar nav, manager dashboard header, or kiosk/checklist page hero. */
  variant?: "nav" | "page" | "header" | "dashboard";
  className?: string;
};

const SIZES = {
  nav: { width: 28, height: 22 },
  header: { width: 190, height: 56 },
  dashboard: { width: 220, height: 64 },
  page: { width: 280, height: 83 },
} as const;

const SOURCES = {
  nav: "/alenio-go-nav-logo.png",
  header: "/alenio-go-logo.png",
  /** Manager Alenio Go dashboard top bar (dark Alenio + script Go). */
  dashboard: "/alenio-go-dashboard-logo.png",
  /** White Alenio wordmark — dark checklist / kiosk headers. */
  page: "/alenio-go-page-logo.png",
} as const;

export function AlenioGoLogo({ variant = "page", className = "" }: Props) {
  const size = SIZES[variant];
  return (
    <img
      src={SOURCES[variant]}
      alt="Alenio Go"
      className={`alenio-go-logo alenio-go-logo--${variant}${className ? ` ${className}` : ""}`}
      width={size.width}
      height={size.height}
    />
  );
}
