import type {
  SnapshotMetric,
  SnapshotPage,
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
  momentumCount: number | null;
  memberDevelopmentCount: number | null;
  memberDevelopmentStatus:
    | "check_in_overdue"
    | "check_in_due_soon"
    | "goals_missing"
    | "on_track"
    | null;
  memberMissingGoals: number | null;
  health: number | null;
  goalsOnTrackPct: number | null;
  goalsRequired: boolean;
  onPressActionTasks?: SnapshotAction;
  onPressDueToday?: SnapshotAction;
  onPressOverdue?: SnapshotAction;
  onPressCompletedToday?: SnapshotAction;
  onPressCheckIns?: SnapshotAction;
  onPressNeedsAttention?: SnapshotAction;
  onPressMomentum?: SnapshotAction;
  onPressHealth?: SnapshotAction;
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

export function percentBandLabel(value: number | null): string {
  if (value == null) return "Not enough data";
  if (value >= 85) return "On Track";
  if (value >= 60) return "Watch";
  return "At Risk";
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

function tasksMetric(input: SnapshotPagesInput): SnapshotMetric {
  // Everything needing action now, so nothing overdue hides behind a today
  // count. Either half being unknown makes the total unknown, rather than
  // quietly reporting a figure that is short.
  const actionCount =
    input.dueToday == null || input.overdue == null
      ? null
      : input.dueToday + input.overdue;

  const metric = countMetric(
    {
      key: "tasks",
      label: "Needs Action",
      accessibilityLabel: "Tasks overdue or due today",
      icon: "tasks",
      iconColor: "#EA580C",
      onPress: input.onPressActionTasks ?? input.onPressDueToday,
    },
    actionCount,
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
  if (actionCount === 0) {
    return { ...metric, secondary: { text: "Nothing assigned", tone: "neutral" } };
  }
  return { ...metric, secondary: { text: "No overdue", tone: "good" } };
}

function personalMomentumMetric(input: SnapshotPagesInput): SnapshotMetric {
  const metric = countMetric(
    {
      key: "momentum",
      label: "Momentum",
      accessibilityLabel: "Your current on-time task streak",
      icon: "streak",
      // Gold marks momentum everywhere, matching the milestone card in Updates.
      iconColor: "#B7791F",
      onPress: input.onPressMomentum,
    },
    input.momentumCount,
  );
  if (input.momentumCount == null) {
    return {
      ...metric,
      secondary: { text: "Not enough data", tone: "neutral" },
    };
  }
  if (input.momentumCount === 0) {
    return {
      ...metric,
      secondary: { text: "Ready to build", tone: "neutral" },
    };
  }
  return {
    ...metric,
    secondary: { text: "Current task streak", tone: "good" },
  };
}

function personalDevelopmentMetric(input: SnapshotPagesInput): SnapshotMetric {
  const metric = countMetric(
    {
      key: "development",
      label: "Development",
      accessibilityLabel: "Your active development goals",
      icon: "goals",
      iconColor: "#7C3AED",
      hidePrimaryIcon: true,
      onPress: input.onPressGoals,
    },
    input.memberDevelopmentCount,
  );
  if (input.memberDevelopmentCount == null) {
    return {
      ...metric,
      statusIndicator: "neutral",
      secondary: { text: "Status unavailable", tone: "neutral" },
    };
  }
  if (input.memberDevelopmentStatus === "check_in_overdue") {
    return {
      ...metric,
      statusIndicator: "bad",
      secondary: { text: "Needs attention", tone: "bad" },
    };
  }
  if (input.memberDevelopmentStatus === "check_in_due_soon") {
    return {
      ...metric,
      statusIndicator: "warn",
      secondary: { text: "Due soon", tone: "warn" },
    };
  }
  if (input.memberDevelopmentStatus === "goals_missing") {
    return {
      ...metric,
      statusIndicator: "bad",
      secondary: { text: "Needs attention", tone: "bad" },
    };
  }
  return {
    ...metric,
    statusIndicator: "good",
    secondary: { text: "On track", tone: "good" },
  };
}

function buildManagerPages(input: SnapshotPagesInput): SnapshotPage[] {
  const checkInsAvailable = input.needsAttention != null;
  const development: SnapshotMetric = {
    key: "development",
    label: "Development",
    accessibilityLabel: checkInsAvailable
      ? `${input.needsAttention} ${
          input.needsAttention === 1 ? "member has" : "members have"
        } a check-in or goal due`
      : "Development attention unavailable",
    icon: "team",
    iconColor: checkInsAvailable && input.needsAttention! > 0 ? "#DC2626" : "#059669",
    value: checkInsAvailable ? String(input.needsAttention) : UNAVAILABLE,
    numericValue: checkInsAvailable ? input.needsAttention : null,
    onPress: checkInsAvailable ? input.onPressNeedsAttention : undefined,
  };

  const momentum = countMetric(
    {
      key: "momentum",
      label: "Momentum",
      accessibilityLabel: "Members with an active on-time task streak",
      icon: "streak",
      // Gold marks momentum everywhere, matching the milestone card in Updates.
      iconColor: "#B7791F",
      onPress: input.onPressMomentum,
    },
    input.momentumCount,
  );

  return [
    {
      key: "daily-operations",
      title: "Workplace Pulse",
      metrics: [
        { ...tasksMetric(input), secondary: undefined },
        development,
        {
          ...momentum,
          secondary: { text: "Active task streaks", tone: "neutral" },
        },
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
      title: "Workplace Pulse",
      metrics: [
        tasksMetric(input),
        personalDevelopmentMetric(input),
        completedWithState,
        personalMomentumMetric(input),
      ],
    },
  ];
}

export function buildSnapshotPages(input: SnapshotPagesInput): SnapshotPage[] {
  return input.isManager ? buildManagerPages(input) : buildMemberPages(input);
}

/** Badge on the Pulse header chip for the currently selected workspace only. */
export function workspacePulseBadgeCount(input: {
  isManager: boolean;
  overdue: number | null;
  needsAttention: number | null;
}): number {
  if (input.isManager) return Math.max(0, input.needsAttention ?? 0);
  return Math.max(0, input.overdue ?? 0);
}

export function bindSnapshotPageActions(
  pages: SnapshotPage[],
  bind: (action?: SnapshotAction) => SnapshotAction | undefined,
): SnapshotPage[] {
  return pages.map((page) => ({
    ...page,
    metrics: page.metrics.map((metric) => ({
      ...metric,
      onPress: bind(metric.onPress),
      secondary: metric.secondary
        ? { ...metric.secondary, onPress: bind(metric.secondary.onPress) }
        : undefined,
    })),
  }));
}
