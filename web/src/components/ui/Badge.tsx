import type { ReactNode } from "react";
import { priorityLabel } from "../../lib/task-display";

export type BadgeTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`al-badge al-badge--${tone}${className ? ` ${className}` : ""}`}>
      {dot ? <span className="al-badge-dot" aria-hidden /> : null}
      {icon}
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<string, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? "neutral"} dot>
      {priorityLabel(priority)}
    </Badge>
  );
}

export type StatusKind = "open" | "done" | "overdue" | "soon";

const STATUS: Record<StatusKind, { tone: BadgeTone; label: string }> = {
  open: { tone: "neutral", label: "Open" },
  done: { tone: "success", label: "Completed" },
  overdue: { tone: "danger", label: "Overdue" },
  soon: { tone: "warning", label: "Due soon" },
};

export function StatusBadge({ status, label }: { status: StatusKind; label?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {label ?? s.label}
    </Badge>
  );
}
