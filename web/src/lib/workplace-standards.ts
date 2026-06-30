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
  checkInFrequencyValue: 7,
  checkInFrequencyUnit: "days",
  checkInGracePeriodDays: 2,
  requiredCheckInTemplateId: null,
  goalsRequired: true,
  minimumActiveGoals: 2,
};

export type StandardsStatusBadge =
  | "On track"
  | "Check-in due soon"
  | "No check-in"
  | "Overdue check-in"
  | "Needs active goals";

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

export const STANDARDS_BADGE_LEGEND: ReadonlyArray<{
  variant: StandardsBadgeVariant;
  label: string;
  description: string;
}> = [
  {
    variant: "no_check_in",
    label: "No check-in",
    description: "No published check-in on record (or none using the required template).",
  },
  {
    variant: "overdue_check_in",
    label: "Overdue check-in",
    description: "Last check-in is past the workspace schedule plus grace period.",
  },
  {
    variant: "check_in_due_soon",
    label: "Check-in due soon",
    description: "Check-in is due within 2 days.",
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
  const items: StandardsBadgeDisplay[] = [];
  if (input.checkInStatus === "overdue") {
    const noCheckIn = input.daysSinceLastCheckIn === null;
    items.push({
      key: noCheckIn ? "no_check_in" : "overdue_check_in",
      label: noCheckIn ? "No check-in" : "Overdue check-in",
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

export function formatGracePeriodSummary(days: number): string {
  if (days === 0) return "None";
  return days === 1 ? "1 day" : `${days} days`;
}

export function frequencyToDays(value: number, unit: CheckInFrequencyUnit): number {
  if (unit === "weeks") return value * 7;
  if (unit === "months") return value * 30;
  return value;
}

export function formatRequiredTemplateSummary(templateTitle: string | null | undefined): string {
  return templateTitle?.trim() ? templateTitle : "Any template";
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
      : compliance.checkInActionText === "Check-in required"
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

export function standardsBadgeClassName(variant: StandardsBadgeVariant): string {
  switch (variant) {
    case "no_check_in":
    case "overdue_check_in":
      return "enterprise-standards-badge enterprise-standards-badge--overdue";
    case "needs_active_goals":
      return "enterprise-standards-badge enterprise-standards-badge--missing-goals";
    case "check_in_due_soon":
      return "enterprise-standards-badge enterprise-standards-badge--due-soon";
    default:
      return "enterprise-standards-badge enterprise-standards-badge--on-track";
  }
}
