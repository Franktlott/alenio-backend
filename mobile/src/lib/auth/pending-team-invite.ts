let pendingToken: string | null = null;

export function setPendingTeamInviteToken(token: string) {
  pendingToken = token.trim() || null;
}

export function getPendingTeamInviteToken(): string | null {
  return pendingToken;
}

export function clearPendingTeamInviteToken() {
  pendingToken = null;
}
