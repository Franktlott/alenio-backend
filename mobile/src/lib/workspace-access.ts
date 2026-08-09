import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import {
  deriveWorkspaceAccess,
  type WorkspaceSubscription,
} from "@/lib/workspace-access-core";
export * from "@/lib/workspace-access-core";
export { subscribeToWorkspaceReadOnly } from "@/lib/workspace-read-only-events";

export function isWorkspaceReadOnlyError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.body?.error?.code === "WORKSPACE_READ_ONLY"
  );
}

export function useWorkspaceAccess(teamIdOverride?: string | null) {
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const teamId = teamIdOverride ?? activeTeamId;
  const setSubscription = useSubscriptionStore((state) => state.setSubscription);
  const clearSubscription = useSubscriptionStore((state) => state.clearSubscription);
  const persisted = useSubscriptionStore((state) => state.subscription);

  const query = useQuery({
    queryKey: ["subscription", teamId],
    queryFn: () => api.get<WorkspaceSubscription>(`/api/teams/${teamId}/subscription`),
    enabled: !!teamId,
    staleTime: 30_000,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!teamId) {
      clearSubscription();
    } else if (query.data) {
      setSubscription(teamId, query.data);
    }
  }, [clearSubscription, query.data, setSubscription, teamId]);

  const liveOrPersisted = query.data ?? (persisted?.teamId === teamId ? persisted.data : null);
  return {
    ...query,
    teamId,
    access: deriveWorkspaceAccess(liveOrPersisted),
  };
}
