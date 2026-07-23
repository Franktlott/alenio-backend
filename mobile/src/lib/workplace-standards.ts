export type CheckInFrequencyUnit = "days" | "weeks" | "months";

export type WorkplaceStandards = {
  checkInRequired: boolean;
  checkInFrequencyValue: number;
  checkInFrequencyUnit: CheckInFrequencyUnit;
  checkInGracePeriodDays: number;
  requiredCheckInTemplateId: string | null;
  goalsRequired: boolean;
  minimumActiveGoals: number;
};

export const DEFAULT_WORKPLACE_STANDARDS: WorkplaceStandards = {
  checkInRequired: true,
  checkInFrequencyValue: 30,
  checkInFrequencyUnit: "days",
  checkInGracePeriodDays: 0,
  requiredCheckInTemplateId: null,
  goalsRequired: true,
  minimumActiveGoals: 2,
};

export type StandardsStatusBadge =
  | "On track"
  | "Check-in due soon"
  | "No initial check-in"
  | "No initial check-in or goals"
  | "Overdue check-in"
  | "Needs active goals";

export const NO_INITIAL_CHECK_IN_ACTION = "No check-in on record yet";
export const NO_INITIAL_CHECK_IN_LABEL = "No initial check-in";
export const NO_INITIAL_CHECK_IN_OR_GOALS_LABEL = "No initial check-in or goals";

export type StandardsBadgeVariant =
  | "on_track"
  | "check_in_due_soon"
  | "no_check_in"
  | "overdue_check_in"
  | "needs_active_goals";

export type StandardsBadgeDisplay = {
  key: string;
  label: string;
  title: string;
  variant: StandardsBadgeVariant;
};

export type MemberStandardsCompliance = {
  checkInStatus: "on_track" | "due_soon" | "overdue" | "not_required";
  checkInActionText: string;
  goalsStatus: "on_track" | "missing_goals" | "not_required";
  goalsActionText: string;
  missingGoals: number;
  statusBadge: StandardsStatusBadge;
  statusBadges?: StandardsStatusBadge[];
  statusBadgeItems?: StandardsBadgeDisplay[];
  goalsDisplay: string;
  minimumActiveGoals: number;
};

export type MemberStatsRow = {
  activeTasks: number;
  overdueTasks: number;
  completedTasks: number;
  streak: number;
  personalBestStreak?: number;
  activeDevGoals?: number;
  devEngagementPct?: number;
  daysSinceLastOneOnOne?: number | null;
  openFollowUpTasks?: number;
  overdueFollowUpTasks?: number;
  standardsCompliance?: MemberStandardsCompliance;
};

export type MemberStatsPayload = {
  stats: Record<string, MemberStatsRow>;
  workplaceStandards?: WorkplaceStandards;
};

export function mergeWorkplaceStandards(
  standards?: WorkplaceStandards | null,
): WorkplaceStandards {
  if (!standards) return { ...DEFAULT_WORKPLACE_STANDARDS };
  return { ...DEFAULT_WORKPLACE_STANDARDS, ...standards };
}

export function formatCheckInFrequencySummary(standards: WorkplaceStandards): string {
  const { checkInFrequencyValue: value, checkInFrequencyUnit: unit } = standards;
  if (!standards.checkInRequired) return "Not required";
  if (value === 1) {
    if (unit === "days") return "Every day";
    if (unit === "weeks") return "Every week";
    return "Every month";
  }
  return `Every ${value} ${unit}`;
}

export function frequencyToDays(value: number, unit: CheckInFrequencyUnit): number {
  if (unit === "weeks") return value * 7;
  if (unit === "months") return value * 30;
  return value;
}

export const STANDARDS_BADGE_LEGEND: ReadonlyArray<{
  variant: StandardsBadgeVariant;
  label: string;
  description: string;
}> = [
  {
    variant: "no_check_in",
    label: NO_INITIAL_CHECK_IN_LABEL,
    description: "No published check-in on record yet (or none using the required template).",
  },
  {
    variant: "overdue_check_in",
    label: "Overdue check-in",
    description: "Last check-in is past the workspace check-in schedule.",
  },
  {
    variant: "check_in_due_soon",
    label: "Check-in due soon",
    description: "80% of the check-in window has passed (e.g. every 10 days → due soon after 8 days).",
  },
  {
    variant: "needs_active_goals",
    label: "Needs active goals",
    description:
      "Active goals are below the workspace minimum. Inactive goals (30+ days without progress) do not count toward the minimum.",
  },
  {
    variant: "on_track",
    label: "On track",
    description: "Meets check-in and goal requirements.",
  },
];

export function buildMemberStandardsBadgeItems(input: {
  checkInStatus: MemberStandardsCompliance["checkInStatus"];
  checkInActionText: string;
  goalsStatus: MemberStandardsCompliance["goalsStatus"];
  goalsActionText: string;
  daysSinceLastCheckIn: number | null;
}): StandardsBadgeDisplay[] {
  const noCheckIn =
    input.checkInStatus === "overdue" && input.daysSinceLastCheckIn === null;
  const missingGoals = input.goalsStatus === "missing_goals";

  if (noCheckIn && missingGoals) {
    return [
      {
        key: "no_initial_check_in_or_goals",
        label: NO_INITIAL_CHECK_IN_OR_GOALS_LABEL,
        title: `${input.checkInActionText}. ${input.goalsActionText}.`,
        variant: "no_check_in",
      },
    ];
  }

  const items: StandardsBadgeDisplay[] = [];
  if (input.checkInStatus === "overdue") {
    items.push({
      key: noCheckIn ? "no_check_in" : "overdue_check_in",
      label: noCheckIn ? NO_INITIAL_CHECK_IN_LABEL : "Overdue check-in",
      title: input.checkInActionText,
      variant: noCheckIn ? "no_check_in" : "overdue_check_in",
    });
  } else if (input.checkInStatus === "due_soon") {
    items.push({
      key: "check_in_due_soon",
      label: "Check-in due soon",
      title: input.checkInActionText,
      variant: "check_in_due_soon",
    });
  }
  if (input.goalsStatus === "missing_goals") {
    items.push({
      key: "needs_active_goals",
      label: "Needs active goals",
      title: input.goalsActionText,
      variant: "needs_active_goals",
    });
  }
  if (items.length === 0) {
    items.push({
      key: "on_track",
      label: "On track",
      title: "Meets check-in and goal requirements.",
      variant: "on_track",
    });
  }
  return items;
}

/** All status badges for a member — check-in and goals issues can both appear. */
export function memberStandardsBadges(
  compliance: MemberStandardsCompliance,
  daysSinceLastCheckIn?: number | null,
): StandardsBadgeDisplay[] {
  if (compliance.statusBadgeItems?.length) return compliance.statusBadgeItems;
  const resolvedDaysSinceCheckIn =
    daysSinceLastCheckIn !== undefined
      ? daysSinceLastCheckIn
      : compliance.checkInActionText === NO_INITIAL_CHECK_IN_ACTION
        || compliance.checkInActionText === "Check-in required"
        ? null
        : 0;
  return buildMemberStandardsBadgeItems({
    checkInStatus: compliance.checkInStatus,
    checkInActionText: compliance.checkInActionText,
    goalsStatus: compliance.goalsStatus,
    goalsActionText: compliance.goalsActionText,
    daysSinceLastCheckIn: resolvedDaysSinceCheckIn,
  });
}

export function standardsBadgeColors(variant: StandardsBadgeVariant): { bg: string; text: string } {
  switch (variant) {
    case "no_check_in":
    case "overdue_check_in":
      return { bg: "#FEF2F2", text: "#DC2626" };
    case "needs_active_goals":
      return { bg: "#EEF2FF", text: "#4F46E5" };
    case "check_in_due_soon":
      return { bg: "#FFF7ED", text: "#C2410C" };
    default:
      return { bg: "#ECFDF5", text: "#059669" };
  }
}
