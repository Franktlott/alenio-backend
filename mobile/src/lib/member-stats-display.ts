import type { MemberStandardsCompliance, WorkplaceStandards } from "./workplace-standards";
import { NO_INITIAL_CHECK_IN_LABEL } from "./workplace-standards";

export type FollowUpTasksDisplay = {
  label: string;
  value: string;
  title: string;
  overdue: true;
};

export type TeamComplianceSummary = {
  checkInCompliancePct: number | null;
  developmentPlanCompliancePct: number | null;
};

export function computeTeamCompliancePercentages(input: {
  memberUserIds: string[];
  memberStats?: Record<string, { standardsCompliance?: MemberStandardsCompliance }>;
  workplaceStandards: WorkplaceStandards;
}): TeamComplianceSummary {
  const { memberUserIds, memberStats, workplaceStandards } = input;
  if (memberUserIds.length === 0) {
    return { checkInCompliancePct: null, developmentPlanCompliancePct: null };
  }

  let checkInCompliant = 0;
  let checkInTotal = 0;
  let goalsCompliant = 0;
  let goalsTotal = 0;

  for (const userId of memberUserIds) {
    const compliance = memberStats?.[userId]?.standardsCompliance;
    if (workplaceStandards.checkInRequired) {
      checkInTotal++;
      if (compliance?.checkInStatus === "on_track" || compliance?.checkInStatus === "due_soon") {
        checkInCompliant++;
      }
    }
    if (workplaceStandards.goalsRequired) {
      goalsTotal++;
      if (compliance?.goalsStatus === "on_track") goalsCompliant++;
    }
  }

  return {
    checkInCompliancePct:
      checkInTotal > 0 ? Math.round((checkInCompliant / checkInTotal) * 100) : null,
    developmentPlanCompliancePct:
      goalsTotal > 0 ? Math.round((goalsCompliant / goalsTotal) * 100) : null,
  };
}

export function formatTeamCompliancePercent(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${pct}%`;
}

export function teamComplianceColor(pct: number | null | undefined): string {
  if (pct == null) return "#94A3B8";
  if (pct >= 100) return "#D97706";
  if (pct > 85) return "#10B981";
  return "#EF4444";
}

export function calendarDaysSinceDate(iso: string): number {
  const then = new Date(iso);
  const now = new Date();
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfThenUtc = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  return Math.max(0, Math.floor((startOfTodayUtc - startOfThenUtc) / 86_400_000));
}

export function formatDaysSinceCheckIn(days: number | null | undefined): string {
  if (days == null) return "None";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

/** Roster status copy aligned with team member list mockup. */
export function formatMemberRosterStatusLabel(label: string): string {
  if (label === NO_INITIAL_CHECK_IN_LABEL) return "Not complete";
  if (label === "Check-in due soon") return "Due soon";
  if (label === "Overdue check-in") return "Overdue";
  if (label === "Needs active goals") return "Not complete";
  return label;
}

/** Roster KPI for overdue check-in follow-ups only; hidden when none are overdue. */
export function formatOverdueFollowUpTasksDisplay(
  overdueFollowUpTasks: number,
): FollowUpTasksDisplay | null {
  if (overdueFollowUpTasks <= 0) return null;
  return {
    label: "Overdue",
    value: String(overdueFollowUpTasks),
    title:
      overdueFollowUpTasks === 1
        ? "1 overdue follow-up from a check-in"
        : `${overdueFollowUpTasks} overdue follow-ups from check-ins`,
    overdue: true,
  };
}
