import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api/api";

// Always show and play sound — OS handles delivery in all app states
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const TONE_NAMES = [
  "bell",
  "tritone",
  "chime",
  "glass",
  "aurora",
  "chord",
  "circles",
  "complete",
  "note",
  "popcorn",
  "pulse",
  "synth",
  "ding",
  "achievement",
  "beep",
  "quickwin",
  "digital",
  "pop",
  "clarity",
  "alert",
  "softbell",
  "cheer",
] as const;

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    // Create a channel for each tone so the OS uses the correct sound
    for (const tone of TONE_NAMES) {
      await Notifications.setNotificationChannelAsync(`alenio_${tone}`, {
        name: `Alenio (${tone})`,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#4361EE",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
        enableLights: true,
        sound: tone,
      });
    }

    // System / default channel (maps to "system" tone on the backend)
    await Notifications.setNotificationChannelAsync("alenio_main", {
      name: "Alenio Notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      sound: "default",
    });

    // Silent channel — no sound, no vibration
    await Notifications.setNotificationChannelAsync("alenio_silent", {
      name: "Alenio (Silent)",
      importance: Notifications.AndroidImportance.MAX,
      sound: null,
      enableVibrate: false,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowProvisional: false,
      },
    });
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  try {
    await api.post("/api/push-token", { token });
  } catch {}

  return token;
}
