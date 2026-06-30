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

export function formatRequiredTemplateSummary(templateTitle: string | null | undefined): string {
  return templateTitle?.trim() ? templateTitle : "Any template";
}

export function standardsBadgeClassName(badge: StandardsStatusBadge): string {
  switch (badge) {
    case "Overdue":
      return "enterprise-standards-badge enterprise-standards-badge--overdue";
    case "Missing Goals":
      return "enterprise-standards-badge enterprise-standards-badge--missing-goals";
    case "Due Soon":
      return "enterprise-standards-badge enterprise-standards-badge--due-soon";
    default:
      return "enterprise-standards-badge enterprise-standards-badge--on-track";
  }
}
