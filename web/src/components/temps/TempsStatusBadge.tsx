import type { ReactNode } from "react";

type Tone =
  | "draft"
  | "published"
  | "archived"
  | "active"
  | "paused"
  | "neutral"
  | "success"
  | "warning"
  | "danger";

const LABELS: Partial<Record<Tone, string>> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  active: "Active",
  paused: "Paused",
};

type Props = {
  tone: Tone;
  children?: ReactNode;
  className?: string;
};

export function TempsStatusBadge({ tone, children, className }: Props) {
  return (
    <span className={["temps-badge", `temps-badge--${tone}`, className].filter(Boolean).join(" ")}>
      {children ?? LABELS[tone] ?? tone}
    </span>
  );
}

export function walkStatusTone(status: string): Tone {
  if (status === "PUBLISHED") return "published";
  if (status === "ARCHIVED") return "archived";
  return "draft";
}
