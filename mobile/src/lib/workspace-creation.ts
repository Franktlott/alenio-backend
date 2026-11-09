import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { confirmPlayCheckout, needsPlayCheckoutGate, preparePlayCheckout } from "@/lib/play-external-links";
export { workspaceCreationErrorMessage } from "@/lib/workspace-creation-errors";

export type WorkspaceCheckoutPlan = "pro" | "operations";

export type PaidWorkspaceCheckout = {
  checkoutId: string;
  url: string;
  expiresAt: string;
};

export type PaidWorkspaceCheckoutStatus = {
  checkoutId: string;
  status: "pending" | "completed" | "expired" | "failed";
  teamId: string | null;
  team: Team | null;
};

export async function createPaidWorkspaceCheckout(input: {
  name: string;
  industry?: string;
  location?: string;
  plan: WorkspaceCheckoutPlan;
}) {
  const playToken = needsPlayCheckoutGate() ? await preparePlayCheckout() : null;
  const checkout = await api.post<PaidWorkspaceCheckout>(
    "/api/workspace-checkouts",
    playToken ? { ...input, playToken } : input,
  );
  if (playToken) await confirmPlayCheckout(checkout.url, playToken);
  return checkout;
}

export function fetchPaidWorkspaceCheckout(checkoutId: string) {
  return api.get<PaidWorkspaceCheckoutStatus>(
    `/api/workspace-checkouts/${encodeURIComponent(checkoutId)}`,
  );
}

