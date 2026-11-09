export type SnapshotTone = "neutral" | "good" | "warn" | "bad" | "action";

/** Icon identity stays a string so page builders remain pure and testable. */
export type SnapshotIconKey =
  | "tasks"
  | "completed"
  | "team"
  | "members"
  | "streak"
  | "checkins"
  | "health"
  | "recognition"
  | "goals"
  | "briefings"
  | "temps"
  | "checklists"
  | "walks";

export type SnapshotSecondary = {
  text: string;
  tone: SnapshotTone;
  onPress?: () => void;
};

export type SnapshotMetric = {
  key: string;
  /** Short caption under the value, e.g. "Due Today". */
  label: string;
  /** Spoken description, e.g. "Tasks due today". */
  accessibilityLabel: string;
  icon: SnapshotIconKey;
  iconColor: string;
  /** Rendered as-is when there is no number to count up to. */
  value: string;
  /** Drives the count-up animation; omit for non-numeric metrics. */
  numericValue?: number | null;
  /** Appended to the animating number, e.g. "%". */
  valueSuffix?: string;
  /** Replaces the numeric value with a status symbol. */
  statusIndicator?: SnapshotTone;
  /** Hides the metric's leading category icon. */
  hidePrimaryIcon?: boolean;
  secondary?: SnapshotSecondary;
  onPress?: () => void;
  comingSoon?: boolean;
  /** Module tiles emphasize the product icon instead of a numeric value. */
  module?: boolean;
};

/**
 * Fallback for a lone page, which has no sibling to distinguish itself from.
 * With more than one page each group wears its own title instead: counts and
 * app launchers are different kinds of thing and one heading flattened them.
 */
export const SNAPSHOT_CARD_TITLE = "At a Glance";

export type SnapshotPage = {
  key: string;
  title: string;
  metrics: SnapshotMetric[];
};

export const SNAPSHOT_TONE_COLORS: Record<SnapshotTone, string> = {
  neutral: "#94A3B8",
  good: "#059669",
  warn: "#D97706",
  bad: "#DC2626",
  action: "#5B45FF",
};
