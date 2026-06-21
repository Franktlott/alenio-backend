type Props = {
  /** Nav tab icon or larger coming-soon page mark. */
  variant?: "nav" | "page";
  className?: string;
};

const CONFIG = {
  nav: { src: "/alenio-go-nav-logo.png", width: 28, height: 22, className: "alenio-go-logo--nav" },
  page: { src: "/alenio-go-dashboard-logo.png", width: 220, height: 64, className: "alenio-go-logo--dashboard" },
} as const;

export function AlenioGoLogo({ variant = "nav", className = "" }: Props) {
  const { src, width, height, className: variantClass } = CONFIG[variant];
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
