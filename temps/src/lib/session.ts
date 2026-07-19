import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "alenio-temps:access-token";
const TEAM_KEY = "alenio-temps:team-id";

let memoryToken: string | null = null;
let memoryTeamId: string | null = null;

async function readSecureToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function writeSecureToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // SecureStore can fail on some simulators — fall through to memory only.
  }
}

export async function loadSession(): Promise<{ token: string | null; teamId: string | null }> {
  let token = await readSecureToken();
  // One-time migrate from AsyncStorage (pre–Phase 1).
  if (!token) {
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      token = legacy;
      await writeSecureToken(legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } else {
    // Ensure legacy copy is cleared once SecureStore has the token.
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  }

  const teamId = await AsyncStorage.getItem(TEAM_KEY);
  memoryToken = token;
  memoryTeamId = teamId;
  return { token, teamId };
}

export function getAccessToken(): string | null {
  return memoryToken;
}

export async function setAccessToken(token: string | null): Promise<void> {
  memoryToken = token;
  await writeSecureToken(token);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

export function getTeamId(): string | null {
  return memoryTeamId;
}

export async function setTeamId(teamId: string | null): Promise<void> {
  memoryTeamId = teamId;
  if (teamId) await AsyncStorage.setItem(TEAM_KEY, teamId);
  else await AsyncStorage.removeItem(TEAM_KEY);
}

export async function clearSession(): Promise<void> {
  memoryToken = null;
  memoryTeamId = null;
  await Promise.all([
    writeSecureToken(null),
    AsyncStorage.removeItem(TOKEN_KEY).catch(() => {}),
    AsyncStorage.removeItem(TEAM_KEY),
  ]);
}
