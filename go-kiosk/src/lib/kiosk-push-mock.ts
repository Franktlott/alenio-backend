import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { loadMockPushToken, saveMockPushToken } from "./kiosk-storage";

export type MockPushStatus =
  | { state: "unsupported"; detail: string }
  | { state: "denied"; detail: string }
  | { state: "ready"; token: string }
  | { state: "error"; detail: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerMockDevicePush(): Promise<MockPushStatus> {
  if (Platform.OS === "web") {
    return { state: "unsupported", detail: "Push registration is native-only." };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      return { state: "denied", detail: "Notification permission was not granted." };
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data?.trim();
    if (!token) {
      return { state: "error", detail: "Could not read an Expo push token." };
    }

    await saveMockPushToken(token);
    return { state: "ready", token };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Push registration failed.";
    return { state: "error", detail };
  }
}

export async function readCachedMockPush(): Promise<MockPushStatus> {
  const cached = await loadMockPushToken();
  if (cached) return { state: "ready", token: cached };
  return { state: "unsupported", detail: "No device push token registered yet." };
}
