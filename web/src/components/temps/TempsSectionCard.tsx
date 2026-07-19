import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

export function TempsSectionCard({ title, description, children, className, actions }: Props) {
  return (
    <section className={["temps-section-card", className].filter(Boolean).join(" ")}>
      {(title || description || actions) && (
        <header className="temps-section-head">
          <div>
            {title ? <h3 className="temps-section-title">{title}</h3> : null}
            {description ? <p className="temps-section-desc">{description}</p> : null}
          </div>
          {actions}
        </header>
      )}
      <div className="temps-section-body">{children}</div>
    </section>
  );
}
