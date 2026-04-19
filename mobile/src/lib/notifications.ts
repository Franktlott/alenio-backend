import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api/api";
import * as Application from "expo-application";

const STATUS_KEY = "notif_reg_status";
const DEBUG_LOG_KEY = "notif_debug_log_v1";

export const saveNotifStatus = (msg: string) =>
  AsyncStorage.setItem(STATUS_KEY, msg).catch(() => {});

export const getNotifStatus = () =>
  AsyncStorage.getItem(STATUS_KEY).catch(() => null);

type NotifDebugEntry = {
  ts: number;
  step: string;
  status: "info" | "ok" | "error";
  detail?: string;
};

async function readDebugLog(): Promise<NotifDebugEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DEBUG_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as NotifDebugEntry[];
  } catch {
    return [];
  }
}

export async function getNotifDebugLog(): Promise<NotifDebugEntry[]> {
  return await readDebugLog();
}

export async function clearNotifDebugLog(): Promise<void> {
  await AsyncStorage.removeItem(DEBUG_LOG_KEY).catch(() => {});
}

async function appendNotifDebug(entry: Omit<NotifDebugEntry, "ts"> & { ts?: number }): Promise<void> {
  try {
    const current = await readDebugLog();
    const next: NotifDebugEntry[] = [
      ...current,
      { ts: entry.ts ?? Date.now(), step: entry.step, status: entry.status, ...(entry.detail ? { detail: entry.detail } : {}) },
    ].slice(-80);
    await AsyncStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT:${label}:${ms}`)), ms);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isValidExpoPushToken(token: string | null | undefined) {
  if (!token) return false;
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

let pushTokenListener: Notifications.EventSubscription | null = null;
function ensurePushTokenListener() {
  if (pushTokenListener) return;
  // SDK 53 + expo-notifications 0.31.x iOS workaround: listener prevents native hang in some builds.
  pushTokenListener = Notifications.addPushTokenListener(() => {});
}

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

  // Delete before recreating — Android locks channel settings (incl. sound) on first creation.
  const channelIds = ["alenio_main", "alenio_bell", "alenio_chime", "alenio_alert", "alenio_silent"];
  await Promise.all(channelIds.map((id) => Notifications.deleteNotificationChannelAsync(id)));

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
    await appendNotifDebug({ step: "start", status: "info" });
    if (!Device.isDevice) {
      console.log("[notifications] Skipping - not a real device");
      await saveNotifStatus("not a real device");
      await appendNotifDebug({ step: "device", status: "error", detail: "not a real device" });
      return null;
    }

    await setupAndroidChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log("[notifications] Existing permission:", existingStatus);
    await appendNotifDebug({ step: "permissions-existing", status: "info", detail: existingStatus });

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
      await appendNotifDebug({ step: "permissions-request", status: finalStatus === "granted" ? "ok" : "error", detail: finalStatus });
    }

    if (finalStatus !== "granted") {
      console.warn("[notifications] Permission denied");
      await saveNotifStatus("permission denied");
      await appendNotifDebug({ step: "permissions-final", status: "error", detail: finalStatus });
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

    const projectId = (projectIdFromExtra ?? projectIdFromEas ?? projectIdFromEnv ?? HARDCODED_EAS_PROJECT_ID)?.trim();

    console.log("[notifications] projectId from extra:", projectIdFromExtra ?? "none");
    console.log("[notifications] projectId from easConfig:", projectIdFromEas ?? "none");
    console.log("[notifications] projectId from env:", projectIdFromEnv ?? "none");
    console.log("[notifications] Using projectId:", projectId ?? "none");
    await appendNotifDebug({
      step: "projectId",
      status: projectId ? "ok" : "error",
      detail: `extra=${projectIdFromExtra ?? "none"} eas=${projectIdFromEas ?? "none"} env=${projectIdFromEnv ?? "none"} using=${projectId ?? "none"}`,
    });

    if (!projectId) {
      console.warn("[notifications] Missing EAS projectId");
      await saveNotifStatus("missing projectId");
      await appendNotifDebug({ step: "projectId", status: "error", detail: "missing projectId" });
      return null;
    }

    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await appendNotifDebug({ step: "attempt", status: "info", detail: `${attempt}/3` });
        await saveNotifStatus(`getting token (attempt ${attempt}/3)...`);
        if (Platform.OS === "ios") {
          ensurePushTokenListener();
          void Application.getIosPushNotificationServiceEnvironmentAsync().catch(() => null);
        }

        await appendNotifDebug({ step: "device-token", status: "info" });
        const devicePushToken = await withTimeout(
          Notifications.getDevicePushTokenAsync(),
          15_000,
          "getDevicePushTokenAsync"
        );

        await appendNotifDebug({ step: "expo-token", status: "info" });
        const tokenResult = await withTimeout(
          Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: devicePushToken as any }),
          30_000,
          "getExpoPushTokenAsync"
        );

        const token = tokenResult.data;
        if (!isValidExpoPushToken(token)) throw new Error("invalid token");

        await saveNotifStatus("saving token to backend...");
        await appendNotifDebug({ step: "backend-save", status: "info" });
        // Prefer the "Push Work" style endpoint if present; fall back to legacy.
        try {
          await withTimeout(api.patch("/api/users/push-token", { pushToken: token }), 15_000, "savePushToken");
        } catch {
          await withTimeout(api.post("/api/push-token", { token }, { skipSignOut: true }), 15_000, "savePushTokenLegacy");
        }

        await saveNotifStatus("registered ok");
        console.log("[notifications] Registered successfully on attempt", attempt);
        await appendNotifDebug({ step: "done", status: "ok", detail: token.substring(0, 35) + "..." });
        return token;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        console.warn(`[notifications] Attempt ${attempt} failed:`, msg);
        await appendNotifDebug({ step: "error", status: "error", detail: msg });
        if (attempt < 3) {
          await saveNotifStatus(`attempt ${attempt} failed, retrying...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    await saveNotifStatus(`failed: ${lastError || "unknown error"}`);
    await appendNotifDebug({ step: "failed", status: "error", detail: lastError || "unknown error" });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[notifications] Push registration failed:", message);
    await saveNotifStatus(`failed: ${message}`);
    await appendNotifDebug({ step: "fatal", status: "error", detail: message });
    return null;
  }
}