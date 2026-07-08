import type { QueryClient } from "@tanstack/react-query";
import { redeemTeamInvite } from "@/lib/team-invites-api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  clearPendingTeamInviteToken,
  getPendingTeamInviteToken,
} from "@/lib/auth/pending-team-invite";
import { primeMobileAuthReady, type MobileAuthReady } from "@/lib/auth/use-session";
import type { MeUser } from "@/lib/auth/me-query";

/** Redeem a stored invite token and select that workspace when possible. */
export async function finishMobilePostAuth(queryClient: QueryClient): Promise<string | null> {
  const token = getPendingTeamInviteToken();
  let teamId: string | null = null;

  if (token) {
    try {
      const result = await redeemTeamInvite(token);
      teamId = result.teamId;
      useTeamStore.getState().setActiveTeamId(result.teamId);
    } catch {
      /* pending invites may already be redeemed by email on the server */
    }
    clearPendingTeamInviteToken();
  }

  await queryClient.invalidateQueries({ queryKey: ["teams"] });
  return teamId;
}

/** Prime atomic auth state; root layout navigates when `auth-ready` is set. */
export async function primeMobileAuthSession(
  queryClient: QueryClient,
  sessionData: { user: unknown },
  me: MeUser
): Promise<MobileAuthReady> {
  const authReady = await primeMobileAuthReady(queryClient, sessionData, me);
  void finishMobilePostAuth(queryClient);
  return authReady;
}
