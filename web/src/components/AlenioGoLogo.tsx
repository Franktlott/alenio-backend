type Props = {
  /** Header bar on iPad kiosk (compact). Default page hero size. */
  variant?: "page" | "header";
  className?: string;
};

export function AlenioGoLogo({ variant = "page", className = "" }: Props) {
  return (
    <img
      src="/alenio-go-logo.png"
      alt="Alenio Go"
      className={`alenio-go-logo alenio-go-logo--${variant}${className ? ` ${className}` : ""}`}
      width={variant === "header" ? 160 : 220}
      height={variant === "header" ? 46 : 64}
    />
  );
}
