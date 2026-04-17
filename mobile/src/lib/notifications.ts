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

  // Only pass projectId if it's a real EAS UUID — slugs cause getExpoPushTokenAsync to fail
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResult = await Notifications.getExpoPushTokenAsync(
    easProjectId ? { projectId: easProjectId } : {}
  );
  const token = tokenResult.data;

  try {
    await api.post("/api/push-token", { token });
  } catch (err) {
    console.error("[notifications] Failed to save push token:", err);
  }

  return token;
}
