import type { QueryClient } from "@tanstack/react-query";
import type { MemberNextAction } from "@/lib/types";

export const MEMBER_NEXT_ACTION_QUERY_PREFIX = ["member-next-action"] as const;

export function memberNextActionQueryKey(teamId: string, memberUserId: string) {
  return [...MEMBER_NEXT_ACTION_QUERY_PREFIX, teamId, memberUserId] as const;
}

export function invalidateMemberNextAction(
  queryClient: QueryClient,
  teamId?: string | null,
  memberUserId?: string | null,
) {
  const queryKey =
    teamId && memberUserId
      ? memberNextActionQueryKey(teamId, memberUserId)
      : teamId
        ? [...MEMBER_NEXT_ACTION_QUERY_PREFIX, teamId]
        : MEMBER_NEXT_ACTION_QUERY_PREFIX;
  return queryClient.invalidateQueries({ queryKey });
}

export type MemberNextActionExecution =
  {
    kind: "navigate";
    pathname: "/plan-one-on-one" | "/(app)/execute" | "/(app)/chat";
    params: Record<string, string>;
  };

/**
 * Converts the backend-owned CTA into an existing mobile flow.
 * Returning null intentionally leaves a server fallback card non-interactive.
 */
export function resolveMemberNextActionExecution(
  action: Pick<MemberNextAction, "id" | "cta">,
): MemberNextActionExecution | null {
  const cta = action.cta;
  if (!cta) return null;

  if (action.id === "first_check_in" || action.id === "overdue_check_in") {
    return {
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        ...cta.params,
        mode: "check-ins",
        developmentSection: "check-ins",
        startCheckIn: "true",
      },
    };
  }
  if (action.id === "schedule_next_check_in") {
    return { kind: "navigate", pathname: "/plan-one-on-one", params: cta.params };
  }
  if (
    action.id === "no_active_development_goals" ||
    action.id === "development_goal_review_due"
  ) {
    return {
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        ...cta.params,
        mode: "goals",
        developmentSection: "goals",
        ...(action.id === "no_active_development_goals"
          ? { createGoal: "true" }
          : {}),
      },
    };
  }
  if (action.id === "overdue_tasks" || action.id === "tasks_due_soon") {
    return {
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        ...cta.params,
        memberTaskFilter:
          action.id === "overdue_tasks" ? "overdue" : "due-soon",
      },
    };
  }
  if (action.id === "everything_up_to_date") {
    return {
      kind: "navigate",
      pathname: "/(app)/chat",
      params: cta.params,
    };
  }
  return null;
}
