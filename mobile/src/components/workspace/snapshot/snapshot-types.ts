export type SnapshotTone = "neutral" | "good" | "warn" | "bad";

/** Icon identity stays a string so page builders remain pure and testable. */
export type SnapshotIconKey =
  | "tasks"
  | "completed"
  | "team"
  | "checkins"
  | "health"
  | "recognition"
  | "goals"
  | "briefings"
  | "temps";

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
  secondary?: SnapshotSecondary;
  onPress?: () => void;
  comingSoon?: boolean;
};

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
};
