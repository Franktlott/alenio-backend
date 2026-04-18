import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api/api";

const STATUS_KEY = "notif_reg_status";

export const saveNotifStatus = (msg: string) =>
  AsyncStorage.setItem(STATUS_KEY, msg).catch(() => {});

export const getNotifStatus = () =>
  AsyncStorage.getItem(STATUS_KEY).catch(() => null);

// Show notifications while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function setupAndroidChannels() {
  if (Platform.OS !== "android") return;

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

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log("[notifications] Skipping - not a real device");
      await saveNotifStatus("not a real device");
      return null;
    }

    await setupAndroidChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log("[notifications] Existing permission:", existingStatus);

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const permissionResponse = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowProvisional: false,
        },
      });

      finalStatus = permissionResponse.status;
      console.log("[notifications] Permission after request:", finalStatus);
    }

    if (finalStatus !== "granted") {
      console.warn("[notifications] Permission denied");
      await saveNotifStatus("permission denied");
      return null;
    }

    const projectIdFromExtra = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;

    const projectIdFromEas = (Constants.easConfig as
      | { projectId?: string }
      | undefined)?.projectId;

    const projectIdFromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    // Fallback to the EAS project ID defined in app.json
    const HARDCODED_EAS_PROJECT_ID = "f40ec24d-0b09-4cc6-8746-805bd60e9ea2";

    const projectId = projectIdFromExtra ?? projectIdFromEas ?? projectIdFromEnv ?? HARDCODED_EAS_PROJECT_ID;

    console.log("[notifications] projectId from extra:", projectIdFromExtra ?? "none");
    console.log("[notifications] projectId from easConfig:", projectIdFromEas ?? "none");
    console.log("[notifications] projectId from env:", projectIdFromEnv ?? "none");
    console.log("[notifications] Using projectId:", projectId ?? "none");

    if (!projectId) {
      console.warn("[notifications] Missing EAS projectId");
      await saveNotifStatus("missing projectId");
      return null;
    }

    await saveNotifStatus("getting Expo push token...");

    const tokenResult = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Expo push token request timed out after 30 seconds")), 30000)
      ),
    ]);

    const token = tokenResult.data;

    console.log("[notifications] Expo token obtained:", token);

    if (!token) {
      console.warn("[notifications] Expo token was empty");
      await saveNotifStatus("empty Expo token");
      return null;
    }

    await saveNotifStatus("saving token to backend...");

    await api.post("/api/push-token", { token }, { skipSignOut: true });

    console.log("[notifications] Token saved to backend successfully");
    await saveNotifStatus("registered ok");

    return token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[notifications] Push registration failed:", message);
    await saveNotifStatus(`failed: ${message}`);
    return null;
  }
}