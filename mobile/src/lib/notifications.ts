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

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alenio_main", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("alenio_bell", {
      name: "Bell",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      sound: "bell",
    });

    await Notifications.setNotificationChannelAsync("alenio_chime", {
      name: "Chime",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      sound: "chime",
    });

    await Notifications.setNotificationChannelAsync("alenio_alert", {
      name: "Alert",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      sound: "alert",
    });

    await Notifications.setNotificationChannelAsync("alenio_silent", {
      name: "Silent",
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

  try {
    const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
    // Race against a 8-second timeout — getExpoPushTokenAsync can hang in dev
    const tokenResult = await Promise.race([
      Notifications.getExpoPushTokenAsync(easProjectId ? { projectId: easProjectId } : {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("push token request timed out")), 8000)
      ),
    ]);
    const token = tokenResult.data;
    await api.post("/api/push-token", { token });
    return token;
  } catch (err) {
    // In dev/Expo Go this often fails — works correctly in production builds
    console.warn("[notifications] Push token unavailable:", (err as Error).message);
    return null;
  }
}
