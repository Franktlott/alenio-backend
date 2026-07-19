import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export function TempsEmptyState({ title, description, icon, action, compact }: Props) {
  return (
    <div className={`temps-empty${compact ? " temps-empty--compact" : ""}`}>
      {icon ? <div className="temps-empty-icon" aria-hidden>{icon}</div> : null}
      <h3 className="temps-empty-title">{title}</h3>
      {description ? <p className="temps-empty-desc">{description}</p> : null}
      {action ? <div className="temps-empty-action">{action}</div> : null}
    </div>
  );
}
