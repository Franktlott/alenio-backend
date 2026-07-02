type Props = {
  /** Nav tab icon, top bar header, or larger page mark. */
  variant?: "nav" | "page" | "header";
  className?: string;
};

const CONFIG = {
  nav: { src: "/alenio-go-nav-logo.png", width: 28, height: 22, className: "alenio-go-logo--nav" },
  page: { src: "/alenio-go-dashboard-logo.png", width: 220, height: 64, className: "alenio-go-logo--dashboard" },
  header: { src: "/alenio-go-dashboard-logo.png", width: 190, height: 56, className: "alenio-go-logo--header" },
} as const;

export function AlenioGoLogo({ variant = "nav", className = "" }: Props) {
  const { src, width, height, className: variantClass } = CONFIG[variant] ?? CONFIG.nav;
  return (
    <img
      src={src}
      alt="Alenio Go"
      className={`alenio-go-logo ${variantClass}${className ? ` ${className}` : ""}`}
      width={width}
      height={height}
    />
  );
}
