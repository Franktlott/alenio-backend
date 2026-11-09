import type { CSSProperties, ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="al-empty">
      {icon ? <div className="al-empty-icon">{icon}</div> : null}
      <p className="al-empty-title">{title}</p>
      {description ? <p className="al-empty-desc">{description}</p> : null}
      {action ? <div className="al-empty-action">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ width, height = 12, radius, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={`al-skeleton${className ? ` ${className}` : ""}`} style={style} aria-hidden />;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <p className="al-error-state" role="alert">
      {children}
    </p>
  );
}
