import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={`al-card${padded ? " al-card--padded" : ""}${className ? ` ${className}` : ""}`} {...rest} />;
}

export function Panel({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`al-card al-panel${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  titleId,
  subtitle,
  actions,
}: {
  title: ReactNode;
  titleId?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="al-panel-head">
      <div className="al-panel-head-text">
        <h2 id={titleId} className="al-panel-title">
          {title}
        </h2>
        {subtitle ? <p className="al-panel-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="al-panel-actions">{actions}</div> : null}
    </header>
  );
}
