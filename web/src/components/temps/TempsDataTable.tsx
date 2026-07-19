import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Accessible label for the table region */
  label?: string;
  minHeight?: "default" | "short" | "none";
};

export function TempsDataTable({
  children,
  footer,
  className,
  label,
  minHeight = "default",
}: Props) {
  return (
    <section
      className={[
        "temps-table-card",
        minHeight === "short" ? "temps-table-card--short" : "",
        minHeight === "none" ? "temps-table-card--flush" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      <div className="temps-table-scroll">{children}</div>
      {footer ? <footer className="temps-table-footer">{footer}</footer> : null}
    </section>
  );
}
