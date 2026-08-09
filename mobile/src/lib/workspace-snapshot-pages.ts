import type {
  SnapshotMetric,
  SnapshotPage,
  SnapshotTone,
} from "@/components/workspace/snapshot/snapshot-types";

export type SnapshotAction = () => void;

export type SnapshotPagesInput = {
  /** Managers get the leadership pages; members get a single personal page. */
  isManager: boolean;
  dueToday: number | null;
  overdue: number | null;
  completedToday: number | null;
  checkInsToday: number | null;
  needsAttention: number | null;
  health: number | null;
  recognitionThisWeek: number | null;
  goalsOnTrackPct: number | null;
  onPressDueToday?: SnapshotAction;
  onPressOverdue?: SnapshotAction;
  onPressCompletedToday?: SnapshotAction;
  onPressCheckIns?: SnapshotAction;
  onPressNeedsAttention?: SnapshotAction;
  onPressHealth?: SnapshotAction;
  onPressRecognition?: SnapshotAction;
  onPressGoals?: SnapshotAction;
};

const UNAVAILABLE = "—";

/** Counts celebrations since the start of the current local week (Sunday). */
export function countRecognitionThisWeek(
  events: { type: string; createdAt: string }[] | undefined,
  now = new Date(),
): number {
  if (!events?.length) return 0;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const cutoff = weekStart.getTime();

  return events.reduce((count, event) => {
    if (event.type !== "celebration") return count;
    const created = new Date(event.createdAt).getTime();
    return Number.isFinite(created) && created >= cutoff ? count + 1 : count;
  }, 0);
}

function percentTone(value: number | null): SnapshotTone {
  if (value == null) return "neutral";
  if (value >= 85) return "good";
  if (value >= 60) return "warn";
  return "bad";
}

export function percentBandLabel(value: number | null): string {
  if (value == null) return "Not enough data";
  if (value >= 85) return "On Track";
  if (value >= 60) return "Watch";
  return "At Risk";
}

function percentColor(value: number | null): string {
  if (value == null) return "#7C3AED";
  if (value >= 85) return "#059669";
  if (value >= 60) return "#D97706";
  return "#DC2626";
}

function countMetric(
  base: Omit<SnapshotMetric, "value" | "numericValue">,
  count: number | null,
): SnapshotMetric {
  if (count == null) {
    return { ...base, value: UNAVAILABLE, numericValue: null, onPress: undefined };
  }
  return { ...base, value: String(count), numericValue: count };
}

function comingSoonMetric(
  key: string,
  icon: SnapshotMetric["icon"],
  label: string,
  accessibilityLabel: string,
): SnapshotMetric {
  return {
    key,
    label,
    accessibilityLabel,
    icon,
    iconColor: "#CBD5E1",
    value: UNAVAILABLE,
    numericValue: null,
    secondary: { text: "Coming soon", tone: "neutral" },
    comingSoon: true,
  };
}

function tasksMetric(input: SnapshotPagesInput): SnapshotMetric {
  const metric = countMetric(
    {
      key: "tasks",
      label: "Due Today",
      accessibilityLabel: "Tasks due today",
      icon: "tasks",
      iconColor: "#EA580C",
      onPress: input.onPressDueToday,
    },
    input.dueToday,
  );

  if (input.overdue != null && input.overdue > 0) {
    return {
      ...metric,
      secondary: {
        text: `${input.overdue} Overdue`,
        tone: "bad",
        onPress: input.onPressOverdue,
      },
    };
  }
  if (input.dueToday === 0) {
    return { ...metric, secondary: { text: "Nothing assigned", tone: "neutral" } };
  }
  return { ...metric, secondary: { text: "No overdue", tone: "good" } };
}

function checkInsMetric(input: SnapshotPagesInput): SnapshotMetric {
  const metric = countMetric(
    {
      key: "checkins",
      label: "Scheduled",
      accessibilityLabel: "Check-ins scheduled today",
      icon: "checkins",
      iconColor: "#2563EB",
      onPress: input.onPressCheckIns,
    },
    input.checkInsToday,
  );
  if (input.checkInsToday === 0) {
    return { ...metric, secondary: { text: "None today", tone: "neutral" } };
  }
  return { ...metric, secondary: { text: "Today", tone: "good" } };
}

function healthMetric(input: SnapshotPagesInput, label: string): SnapshotMetric {
  const available = input.health != null;
  return {
    key: "health",
    label,
    accessibilityLabel: label,
    icon: "health",
    iconColor: percentColor(input.health),
    value: available ? `${input.health}%` : UNAVAILABLE,
    numericValue: available ? input.health : null,
    valueSuffix: "%",
    secondary: {
      text: percentBandLabel(input.health),
      tone: percentTone(input.health),
    },
    onPress: available ? input.onPressHealth : undefined,
  };
}

function buildManagerPages(input: SnapshotPagesInput): SnapshotPage[] {
  const team = countMetric(
    {
      key: "team",
      label: "Need Attention",
      accessibilityLabel: "People needing attention",
      icon: "team",
      iconColor: "#DC2626",
      onPress: input.onPressNeedsAttention,
    },
    input.needsAttention,
  );
  const teamWithState: SnapshotMetric =
    input.needsAttention === 0
      ? { ...team, secondary: { text: "All caught up", tone: "good" } }
      : { ...team, secondary: { text: "Review now", tone: "warn" } };

  const recognition = countMetric(
    {
      key: "recognition",
      label: "This Week",
      accessibilityLabel: "Recognition this week",
      icon: "recognition",
      iconColor: "#D97706",
      onPress: input.onPressRecognition,
    },
    input.recognitionThisWeek,
  );
  const recognitionWithState: SnapshotMetric =
    input.recognitionThisWeek === 0
      ? { ...recognition, secondary: { text: "None yet", tone: "neutral" } }
      : { ...recognition, secondary: { text: "Celebrations", tone: "good" } };

  const goalsAvailable = input.goalsOnTrackPct != null;
  const goals: SnapshotMetric = {
    key: "goals",
    label: "Goals",
    accessibilityLabel: "Goals on track",
    icon: "goals",
    iconColor: percentColor(input.goalsOnTrackPct),
    value: goalsAvailable ? `${input.goalsOnTrackPct}%` : UNAVAILABLE,
    numericValue: goalsAvailable ? input.goalsOnTrackPct : null,
    valueSuffix: "%",
    secondary: {
      text: percentBandLabel(input.goalsOnTrackPct),
      tone: percentTone(input.goalsOnTrackPct),
    },
    onPress: goalsAvailable ? input.onPressGoals : undefined,
  };

  return [
    {
      key: "daily-operations",
      title: "Today's Overview",
      metrics: [
        tasksMetric(input),
        teamWithState,
        checkInsMetric(input),
        healthMetric(input, "Workspace Health"),
      ],
    },
    {
      key: "leadership",
      title: "Leadership & Performance",
      metrics: [
        recognitionWithState,
        goals,
        comingSoonMetric("briefings", "briefings", "Briefings", "Briefings"),
        comingSoonMetric("temps", "temps", "Temps", "Temperature checks"),
      ],
    },
  ];
}

function buildMemberPages(input: SnapshotPagesInput): SnapshotPage[] {
  const completed = countMetric(
    {
      key: "completed",
      label: "Completed",
      accessibilityLabel: "Completed today",
      icon: "completed",
      iconColor: "#16A34A",
      onPress: input.onPressCompletedToday,
    },
    input.completedToday,
  );
  const completedWithState: SnapshotMetric =
    input.completedToday === 0
      ? { ...completed, secondary: { text: "None yet today", tone: "neutral" } }
      : { ...completed, secondary: { text: "Nice work", tone: "good" } };

  return [
    {
      key: "my-day",
      title: "My Day",
      metrics: [
        tasksMetric(input),
        checkInsMetric(input),
        completedWithState,
        healthMetric(input, "My Health"),
      ],
    },
  ];
}

export function buildSnapshotPages(input: SnapshotPagesInput): SnapshotPage[] {
  return input.isManager ? buildManagerPages(input) : buildMemberPages(input);
}
