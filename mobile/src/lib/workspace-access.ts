import { useEffect } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
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

type SubscriptionFingerprintSource = {
  plan?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  hasStripeCustomer?: boolean | null;
  hasStripeSubscription?: boolean | null;
  remainingDays?: number | null;
};

function subscriptionFingerprint(
  subscription: SubscriptionFingerprintSource | null | undefined,
): string {
  if (!subscription) return "";
  return [
    subscription.plan ?? "",
    subscription.status ?? "",
    subscription.currentPeriodEnd ?? "",
    subscription.cancelAtPeriodEnd === true ? "1" : "0",
    subscription.hasStripeCustomer === true ? "1" : "0",
    subscription.hasStripeSubscription === true ? "1" : "0",
    subscription.remainingDays ?? "",
  ].join("|");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pull the latest plan from the API (forcing Stripe reconcile) and update the
 * React Query cache immediately. After checkout/portal, pass `poll: true` so we
 * keep checking until Stripe's change lands instead of leaving stale UI.
 */
export async function refreshTeamSubscription(
  queryClient: QueryClient,
  teamId: string,
  options?: {
    poll?: boolean;
    previous?: SubscriptionFingerprintSource | null;
  },
): Promise<WorkspaceSubscription | null> {
  if (!teamId) return null;

  const fetchOnce = async () => {
    const data = await api.get<WorkspaceSubscription>(
      `/api/teams/${teamId}/subscription?refresh=1`,
    );
    queryClient.setQueryData(["subscription", teamId], data);
    useSubscriptionStore.getState().setSubscription(teamId, data);
    return data;
  };

  const baseline = subscriptionFingerprint(options?.previous);
  let latest = await fetchOnce();

  if (
    options?.poll &&
    (!baseline || subscriptionFingerprint(latest) === baseline)
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(1200);
      latest = await fetchOnce();
      if (baseline && subscriptionFingerprint(latest) !== baseline) break;
    }
  }

  void queryClient.invalidateQueries({ queryKey: ["teams"] });
  return latest;
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
