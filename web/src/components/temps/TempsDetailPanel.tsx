import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  label?: string;
};

export function TempsDetailPanel({ title, meta, children, footer, className, label }: Props) {
  return (
    <aside
      className={["temps-detail-panel", className].filter(Boolean).join(" ")}
      aria-label={label ?? "Details"}
    >
      {(title || meta) && (
        <header className="temps-detail-head">
          {title ? <h2>{title}</h2> : null}
          {meta}
        </header>
      )}
      <div className="temps-detail-body">{children}</div>
      {footer ? <footer className="temps-detail-foot">{footer}</footer> : null}
    </aside>
  );
}
