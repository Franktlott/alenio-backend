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
  if (!Device.isDevice) {
    console.log("[notifications] Skipping — not a real device");
    return null;
  }

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
  console.log("[notifications] Permission status:", existingStatus);
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
    console.log("[notifications] Permission after request:", finalStatus);
  }
  if (finalStatus !== "granted") {
    console.warn("[notifications] Permission denied — cannot register push token");
    return null;
  }

  // Try app.json extra first, then EAS build metadata (auto-populated by EAS builds)
  const projectIdFromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const projectIdFromEas = (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  const easProjectId = projectIdFromExtra ?? projectIdFromEas;
  console.log("[notifications] projectId from extra:", projectIdFromExtra ?? "none");
  console.log("[notifications] projectId from easConfig:", projectIdFromEas ?? "none");
  console.log("[notifications] Using projectId:", easProjectId ?? "none (auto-detect)");

  try {
    const tokenResult = await Promise.race([
      Notifications.getExpoPushTokenAsync(easProjectId ? { projectId: easProjectId } : {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("push token request timed out after 15s")), 15000)
      ),
    ]);
    const token = tokenResult.data;
    console.log("[notifications] Token obtained:", token.slice(0, 30) + "...");
    await api.post("/api/push-token", { token });
    console.log("[notifications] Token saved to backend successfully");
    return token;
  } catch (err) {
    console.warn("[notifications] Push token failed:", (err as Error).message);
    return null;
  }
}
