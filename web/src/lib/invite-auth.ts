import { fetchWebMe, redeemTeamInvite } from "./api";
import { syncBackendUser } from "./auth-client";
import { setMobileHandoffEmail } from "./app-links";
import { setPersistedEnterpriseTeamId } from "./enterprise-selected-team";
import { isMobileBrowser } from "./mobile-browser";

const INVITE_TOKEN_KEY = "alenio_pending_invite_token";

export function setPendingInviteToken(token: string) {
  sessionStorage.setItem(INVITE_TOKEN_KEY, token.trim());
}

export function getPendingInviteToken(): string | null {
  return sessionStorage.getItem(INVITE_TOKEN_KEY)?.trim() || null;
}

export function clearPendingInviteToken() {
  sessionStorage.removeItem(INVITE_TOKEN_KEY);
}

/** Sync user, redeem email invite token if present, then go to chat (join/create UI if no teams). */
export async function finishPostAuthNavigation(): Promise<string> {
  await syncBackendUser();

  const token = getPendingInviteToken();
  if (token) {
    try {
      const result = await redeemTeamInvite(token);
      setPersistedEnterpriseTeamId(result.teamId);
    } catch {
      /* pending invites may already be redeemed by email on the server */
    }
    clearPendingInviteToken();
  }

  if (isMobileBrowser()) {
    try {
      const me = await fetchWebMe();
      if (me?.email) setMobileHandoffEmail(me.email);
    } catch {
      /* handoff page still works without email */
    }
    return "/get-app";
  }

  return "/chat";
}
