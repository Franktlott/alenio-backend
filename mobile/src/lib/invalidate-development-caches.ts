import type { QueryClient } from "@tanstack/react-query";
import { invalidateMemberNextAction } from "@/lib/member-next-action";

/**
 * Refreshes everything the Team tab reads about someone's development, so a
 * new goal or a finished check-in shows up on their row straight away.
 *
 * Queries do not refetch on mount or on window focus, so anything not
 * explicitly invalidated here keeps showing its old numbers until something
 * unrelated happens to clear it.
 */
export function invalidateDevelopmentCaches(
  queryClient: QueryClient,
  teamId?: string | null,
  memberUserId?: string | null,
) {
  void invalidateMemberNextAction(queryClient, teamId, memberUserId);
  if (!teamId) return;
  // Goal counts and check-in compliance behind every member row.
  void queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
  // The "Next check-in" date on each row.
  void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
  void queryClient.invalidateQueries({
    queryKey: ["planned-one-on-ones", teamId],
  });
  // Leader summaries sitting above the member list.
  void queryClient.invalidateQueries({ queryKey: ["team-momentum", teamId] });
  void queryClient.invalidateQueries({
    queryKey: ["team-health-history", teamId],
  });
}
