import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="al-page-head">
      <div className="al-page-head-text">
        {eyebrow ? <div className="al-page-eyebrow">{eyebrow}</div> : null}
        <h1 className="al-page-title">{title}</h1>
        {subtitle ? <p className="al-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="al-page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="al-section-head">
      <div>
        <h3 id={id} className="al-section-title">
          {title}
        </h3>
        {subtitle ? <p className="al-section-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="al-section-actions">{actions}</div> : null}
    </div>
  );
}
