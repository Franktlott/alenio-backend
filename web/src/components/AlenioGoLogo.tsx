type Props = {
  /** Sidebar nav, iPad header, or page hero. */
  variant?: "nav" | "page" | "header";
  className?: string;
};

const SIZES = {
  nav: { width: 28, height: 22 },
  header: { width: 152, height: 44 },
  page: { width: 280, height: 83 },
} as const;

const SOURCES = {
  nav: "/alenio-go-nav-logo.png",
  header: "/alenio-go-logo.png",
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
