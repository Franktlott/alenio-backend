import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "alenio-temps:access-token";
const TEAM_KEY = "alenio-temps:team-id";

let memoryToken: string | null = null;
let memoryTeamId: string | null = null;

export async function loadSession(): Promise<{ token: string | null; teamId: string | null }> {
  const [token, teamId] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(TEAM_KEY),
  ]);
  memoryToken = token;
  memoryTeamId = teamId;
  return { token, teamId };
}

export function getAccessToken(): string | null {
  return memoryToken;
}

export async function setAccessToken(token: string | null): Promise<void> {
  memoryToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
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
  await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(TEAM_KEY)]);
}
