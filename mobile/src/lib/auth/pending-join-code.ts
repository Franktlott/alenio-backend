import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_JOIN_CODE_KEY = "alenio_pending_join_code";

let pendingCode: string | null = null;
let hydrated = false;

export function normalizeJoinInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export async function hydratePendingJoinCode(): Promise<string | null> {
  if (hydrated) return pendingCode;
  hydrated = true;
  try {
    const stored = (await AsyncStorage.getItem(PENDING_JOIN_CODE_KEY))?.trim() || null;
    pendingCode = stored ? normalizeJoinInviteCode(stored) : null;
  } catch {
    pendingCode = null;
  }
  return pendingCode;
}

export function setPendingJoinCode(code: string) {
  const normalized = normalizeJoinInviteCode(code);
  pendingCode = normalized || null;
  hydrated = true;
  if (pendingCode) {
    AsyncStorage.setItem(PENDING_JOIN_CODE_KEY, pendingCode).catch(() => {});
  } else {
    AsyncStorage.removeItem(PENDING_JOIN_CODE_KEY).catch(() => {});
  }
}

export function getPendingJoinCode(): string | null {
  return pendingCode;
}

export function clearPendingJoinCode() {
  pendingCode = null;
  hydrated = true;
  AsyncStorage.removeItem(PENDING_JOIN_CODE_KEY).catch(() => {});
}
