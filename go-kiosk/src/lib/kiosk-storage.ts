import AsyncStorage from "@react-native-async-storage/async-storage";

const HUB_KEY = "alenio.go.kiosk.hubToken";
const TEAM_KEY = "alenio.go.kiosk.teamName";
const PUSH_KEY = "alenio.go.kiosk.pushToken";

export type LinkedKioskWorkspace = {
  hubToken: string;
  teamName: string | null;
};

export async function loadLinkedKiosk(): Promise<LinkedKioskWorkspace | null> {
  const [hubToken, teamName] = await Promise.all([
    AsyncStorage.getItem(HUB_KEY),
    AsyncStorage.getItem(TEAM_KEY),
  ]);
  if (!hubToken?.trim()) return null;
  return { hubToken: hubToken.trim(), teamName: teamName?.trim() || null };
}

export async function saveLinkedKiosk(hubToken: string, teamName?: string | null): Promise<void> {
  await AsyncStorage.setItem(HUB_KEY, hubToken.trim());
  if (teamName?.trim()) {
    await AsyncStorage.setItem(TEAM_KEY, teamName.trim());
  }
}

export async function clearLinkedKiosk(): Promise<void> {
  await AsyncStorage.multiRemove([HUB_KEY, TEAM_KEY]);
}

export async function saveMockPushToken(token: string | null): Promise<void> {
  if (!token?.trim()) {
    await AsyncStorage.removeItem(PUSH_KEY);
    return;
  }
  await AsyncStorage.setItem(PUSH_KEY, token.trim());
}

export async function loadMockPushToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PUSH_KEY);
  return token?.trim() || null;
}
