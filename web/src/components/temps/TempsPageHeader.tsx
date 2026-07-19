import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
};

export function TempsPageHeader({ title, description, breadcrumb, badges, actions }: Props) {
  return (
    <header className="temps-page-header">
      <div className="temps-page-header-copy">
        {breadcrumb ? <div className="temps-breadcrumb">{breadcrumb}</div> : null}
        <div className="temps-page-title-row">
          <h1 className="temps-page-title">{title}</h1>
          {badges ? <div className="temps-page-badges">{badges}</div> : null}
        </div>
        {description ? <p className="temps-page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="temps-page-actions">{actions}</div> : null}
    </header>
  );
}
