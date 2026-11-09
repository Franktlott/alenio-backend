import type { ReactNode } from "react";
import { priorityLabel } from "../../lib/task-display";

export type IndicatorTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

/** Quiet status marker: small dot + label. Use Badge when a row needs emphasis. */
export function StatusIndicator({ tone = "neutral", children, title }: { tone?: IndicatorTone; children: ReactNode; title?: string }) {
  return (
    <span className={`al-ind al-ind--${tone}`} title={title}>
      <span className="al-ind-dot" aria-hidden />
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<string, IndicatorTone> = {
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

export function PriorityIndicator({ priority }: { priority: string }) {
  const label = priorityLabel(priority);
  if (label === "—") return null;
  return (
    <StatusIndicator tone={PRIORITY_TONE[priority] ?? "neutral"} title={`${label} priority`}>
      {label}
    </StatusIndicator>
  );
}
