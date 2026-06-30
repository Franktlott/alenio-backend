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

export type StandardsStatusBadge = "On Track" | "Due Soon" | "Overdue" | "Missing Goals";

export type MemberStandardsCompliance = {
  checkInStatus: "on_track" | "due_soon" | "overdue" | "not_required";
  checkInActionText: string;
  goalsStatus: "on_track" | "missing_goals" | "not_required";
  goalsActionText: string;
  missingGoals: number;
  statusBadge: StandardsStatusBadge;
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

export function standardsBadgeColors(badge: StandardsStatusBadge): { bg: string; text: string } {
  switch (badge) {
    case "Overdue":
      return { bg: "#FEF2F2", text: "#DC2626" };
    case "Missing Goals":
      return { bg: "#EEF2FF", text: "#4F46E5" };
    case "Due Soon":
      return { bg: "#FFF7ED", text: "#C2410C" };
    default:
      return { bg: "#ECFDF5", text: "#059669" };
  }
}
