import type {
  SenecaFocusActionId,
  SenecaFocusResponse,
} from "@/lib/seneca-focus";

export type SenecaFocusPresentationState =
  | "stale"
  | "completed"
  | "positive"
  | "low_data"
  | "fallback"
  | "generated";

export function senecaFocusPresentationState(
  focus: SenecaFocusResponse,
): SenecaFocusPresentationState {
  if (focus.stale || focus.brief.status === "stale") return "stale";
  if (focus.brief.status === "completed") return "completed";
  if (focus.brief.status === "positive") return "positive";
  if (focus.brief.status === "low_data") return "low_data";
  if (
    focus.brief.status === "fallback" ||
    focus.generatedBy === "deterministic"
  ) {
    return "fallback";
  }
  return "generated";
}

export function senecaFocusStateLabel(
  state: SenecaFocusPresentationState,
): string | null {
  switch (state) {
    case "stale":
      return "Stale";
    case "completed":
      return "Completed";
    case "positive":
      return "Positive";
    case "low_data":
      return "Getting to know your team";
    case "fallback":
      return "Data-based";
    default:
      return null;
  }
}

export function senecaFocusDestination(
  action: SenecaFocusActionId,
  teamId: string,
  affectedMemberIds: string[] = [],
) {
  switch (action) {
    case "view_check_ins":
      return {
        pathname: "/team-priority" as const,
        params: { teamId, filter: "checkInDue" },
      };
    case "view_goals":
      return {
        pathname: "/team-priority" as const,
        params: { teamId, filter: "goalsMissing" },
      };
    case "view_overdue_tasks":
      return {
        pathname: "/team-priority" as const,
        params: { teamId, filter: "overdueTasks" },
      };
    case "view_workload":
      return { pathname: "/(app)/execute" as const, params: {} };
    case "create_recognition":
      return {
        pathname: "/(app)/activity" as const,
        params: {
          openCelebrate: "1",
          teamId,
          ...(affectedMemberIds.length === 1
            ? { targetUserId: affectedMemberIds[0] }
            : {}),
        },
      };
    case "open_team":
      return { pathname: "/(app)/team" as const, params: {} };
  }
}
