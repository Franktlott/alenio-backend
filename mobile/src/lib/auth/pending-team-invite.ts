import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_TEAM_INVITE_KEY = "alenio_pending_team_invite_token";

let pendingToken: string | null = null;
let hydrated = false;

export async function hydratePendingTeamInviteToken(): Promise<string | null> {
  if (hydrated) return pendingToken;
  hydrated = true;
  try {
    pendingToken = (await AsyncStorage.getItem(PENDING_TEAM_INVITE_KEY))?.trim() || null;
  } catch {
    pendingToken = null;
  }
  return pendingToken;
}

export function setPendingTeamInviteToken(token: string) {
  pendingToken = token.trim() || null;
  hydrated = true;
  if (pendingToken) {
    AsyncStorage.setItem(PENDING_TEAM_INVITE_KEY, pendingToken).catch(() => {});
  } else {
    AsyncStorage.removeItem(PENDING_TEAM_INVITE_KEY).catch(() => {});
  }
}

export function getPendingTeamInviteToken(): string | null {
  return pendingToken;
}

export function clearPendingTeamInviteToken() {
  pendingToken = null;
  hydrated = true;
  AsyncStorage.removeItem(PENDING_TEAM_INVITE_KEY).catch(() => {});
}
