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
  /** Primary badge — highest-priority issue, or "On track". */
  statusBadge: StandardsStatusBadge;
  /** All applicable badges (check-in and goals can both appear). */
  statusBadges: StandardsStatusBadge[];
  statusBadgeItems: StandardsBadgeDisplay[];
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

const FREQUENCY_UNITS: CheckInFrequencyUnit[] = ["days", "weeks", "months"];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseWorkplaceStandards(raw: string | null | undefined): WorkplaceStandards {
  if (!raw) return { ...DEFAULT_WORKPLACE_STANDARDS };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkplaceStandards>;
    const unit = FREQUENCY_UNITS.includes(parsed.checkInFrequencyUnit as CheckInFrequencyUnit)
      ? (parsed.checkInFrequencyUnit as CheckInFrequencyUnit)
      : DEFAULT_WORKPLACE_STANDARDS.checkInFrequencyUnit;
    return {
      checkInRequired:
        typeof parsed.checkInRequired === "boolean"
          ? parsed.checkInRequired
          : DEFAULT_WORKPLACE_STANDARDS.checkInRequired,
      checkInFrequencyValue: clampInt(
        Number(parsed.checkInFrequencyValue),
        1,
        365,
      ),
      checkInFrequencyUnit: unit,
      checkInGracePeriodDays: clampInt(
        Number(parsed.checkInGracePeriodDays),
        0,
        90,
      ),
      requiredCheckInTemplateId:
        typeof parsed.requiredCheckInTemplateId === "string" && parsed.requiredCheckInTemplateId.trim()
          ? parsed.requiredCheckInTemplateId.trim()
          : null,
      goalsRequired:
        typeof parsed.goalsRequired === "boolean"
          ? parsed.goalsRequired
          : DEFAULT_WORKPLACE_STANDARDS.goalsRequired,
      minimumActiveGoals: clampInt(
        Number(parsed.minimumActiveGoals),
        0,
        50,
      ),
    };
  } catch {
    return { ...DEFAULT_WORKPLACE_STANDARDS };
  }
}

export function serializeWorkplaceStandards(standards: WorkplaceStandards): string {
  return JSON.stringify(standards);
}

export function parseWorkplaceStandardsPatch(
  body: unknown,
): { ok: true; value: WorkplaceStandards } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid workplace standards payload" };
  }
  const input = body as Partial<WorkplaceStandards>;
  const current = { ...DEFAULT_WORKPLACE_STANDARDS };

  if (typeof input.checkInRequired === "boolean") current.checkInRequired = input.checkInRequired;
  if (typeof input.goalsRequired === "boolean") current.goalsRequired = input.goalsRequired;

  if (input.checkInFrequencyValue !== undefined) {
    const value = Number(input.checkInFrequencyValue);
    if (!Number.isFinite(value) || value < 1 || value > 365) {
      return { ok: false, message: "Check-in frequency must be between 1 and 365" };
    }
    current.checkInFrequencyValue = Math.round(value);
  }

  if (input.checkInFrequencyUnit !== undefined) {
    if (!FREQUENCY_UNITS.includes(input.checkInFrequencyUnit)) {
      return { ok: false, message: "Check-in frequency unit must be days, weeks, or months" };
    }
    current.checkInFrequencyUnit = input.checkInFrequencyUnit;
  }

  if (input.checkInGracePeriodDays !== undefined) {
    const grace = Number(input.checkInGracePeriodDays);
    if (!Number.isFinite(grace) || grace < 0 || grace > 90) {
      return { ok: false, message: "Grace period must be between 0 and 90 days" };
    }
    current.checkInGracePeriodDays = Math.round(grace);
  }

  if (input.minimumActiveGoals !== undefined) {
    const minGoals = Number(input.minimumActiveGoals);
    if (!Number.isFinite(minGoals) || minGoals < 0 || minGoals > 50) {
      return { ok: false, message: "Minimum active goals must be between 0 and 50" };
    }
    current.minimumActiveGoals = Math.round(minGoals);
  }

  if (input.requiredCheckInTemplateId === null) {
    current.requiredCheckInTemplateId = null;
  } else if (typeof input.requiredCheckInTemplateId === "string") {
    const trimmed = input.requiredCheckInTemplateId.trim();
    current.requiredCheckInTemplateId = trimmed || null;
  }

  return { ok: true, value: current };
}

export function frequencyToDays(value: number, unit: CheckInFrequencyUnit): number {
  if (unit === "weeks") return value * 7;
  if (unit === "months") return value * 30;
  return value;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function formatCheckInFrequencySummary(standards: WorkplaceStandards): string {
  const { checkInFrequencyValue: value, checkInFrequencyUnit: unit } = standards;
  if (value === 1) {
    if (unit === "days") return "Every day";
    if (unit === "weeks") return "Every week";
    return "Every month";
  }
  return `Every ${value} ${unit}`;
}

export function formatGracePeriodSummary(days: number): string {
  if (days === 0) return "None";
  return pluralize(days, "day");
}

export function computeMemberStandardsCompliance(
  standards: WorkplaceStandards,
  daysSinceLastCheckIn: number | null,
  activeDevGoals: number,
): MemberStandardsCompliance {
  const minimumActiveGoals = standards.goalsRequired ? standards.minimumActiveGoals : 0;
  const goalsDisplay = standards.goalsRequired
    ? `${Math.max(0, activeDevGoals)}/${minimumActiveGoals}`
    : `${Math.max(0, activeDevGoals)}`;

  let checkInStatus: MemberStandardsCompliance["checkInStatus"] = "not_required";
  let checkInActionText = "Check-ins not required";
  let goalsStatus: MemberStandardsCompliance["goalsStatus"] = "not_required";
  let goalsActionText = "Development goals not required";
  let missingGoals = 0;

  if (standards.checkInRequired) {
    const frequencyDays = frequencyToDays(
      standards.checkInFrequencyValue,
      standards.checkInFrequencyUnit,
    );
    const grace = standards.checkInGracePeriodDays;
    const overdueThreshold = frequencyDays + grace;

    if (daysSinceLastCheckIn === null) {
      checkInStatus = "overdue";
      checkInActionText = "Check-in required";
    } else {
      const daysUntilDue = frequencyDays - daysSinceLastCheckIn;
      if (daysSinceLastCheckIn > overdueThreshold) {
        checkInStatus = "overdue";
        const daysOverdue = daysSinceLastCheckIn - overdueThreshold;
        checkInActionText = `Check-in overdue by ${pluralize(daysOverdue, "day")}`;
      } else if (daysUntilDue <= 2) {
        checkInStatus = "due_soon";
        if (daysUntilDue < 0) {
          const daysPastDue = Math.abs(daysUntilDue);
          checkInActionText = `Check-in overdue by ${pluralize(daysPastDue, "day")}`;
        } else if (daysUntilDue === 0) {
          checkInActionText = "Check-in due today";
        } else {
          checkInActionText = `Check-in due in ${pluralize(daysUntilDue, "day")}`;
        }
      } else {
        checkInStatus = "on_track";
        checkInActionText = `Check-in due in ${pluralize(daysUntilDue, "day")}`;
      }
    }
  }

  if (standards.goalsRequired) {
    missingGoals = Math.max(0, standards.minimumActiveGoals - activeDevGoals);
    if (missingGoals > 0) {
      goalsStatus = "missing_goals";
      goalsActionText = `Needs ${pluralize(missingGoals, "active goal")}`;
    } else {
      goalsStatus = "on_track";
      goalsActionText = "Meeting goal requirement";
    }
  }

  let statusBadge: StandardsStatusBadge = "On track";
  const statusBadgeItems = buildMemberStandardsBadgeItems({
    checkInStatus,
    checkInActionText,
    goalsStatus,
    goalsActionText,
    daysSinceLastCheckIn,
  });
  const statusBadges = statusBadgeItems.map((item) => item.label as StandardsStatusBadge);
  statusBadge = statusBadges[0] ?? "On track";

  return {
    checkInStatus,
    checkInActionText,
    goalsStatus,
    goalsActionText,
    missingGoals,
    statusBadge,
    statusBadges,
    statusBadgeItems,
    goalsDisplay,
    minimumActiveGoals,
  };
}
