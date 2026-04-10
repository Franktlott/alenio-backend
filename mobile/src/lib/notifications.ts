import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api/api";

// Tone configuration (must match profile.tsx)
const TONES = [
  { id: "none",        label: "None",          url: null },
  { id: "system",      label: "System Default", url: null },
  { id: "bell",        label: "Bell",           url: "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3" },
  { id: "tritone",     label: "Tri-tone",       url: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3" },
  { id: "chime",       label: "Chime",          url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
  { id: "glass",       label: "Glass",          url: "https://assets.mixkit.co/active_storage/sfx/2308/2308-preview.mp3" },
  { id: "aurora",      label: "Aurora",         url: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3" },
  { id: "chord",       label: "Chord",          url: "https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3" },
  { id: "circles",     label: "Circles",        url: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3" },
  { id: "complete",    label: "Complete",       url: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3" },
  { id: "note",        label: "Note",           url: "https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3" },
  { id: "popcorn",     label: "Popcorn",        url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" },
  { id: "pulse",       label: "Pulse",          url: "https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3" },
  { id: "synth",       label: "Synth",          url: "https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3" },
  { id: "ding",        label: "Ding",           url: "https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3" },
  { id: "achievement", label: "Achievement",    url: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3" },
  { id: "beep",        label: "Beep",           url: "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3" },
  { id: "quickwin",    label: "Quick Win",      url: "https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3" },
  { id: "digital",     label: "Digital",        url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" },
  { id: "pop",         label: "Pop",            url: "https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3" },
  { id: "clarity",     label: "Clarity",        url: "https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3" },
  { id: "alert",       label: "Alert",          url: "https://assets.mixkit.co/active_storage/sfx/2575/2575-preview.mp3" },
  { id: "softbell",    label: "Soft Bell",      url: "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3" },
  { id: "cheer",       label: "Cheer",          url: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3" },
];

const MSG_TONE_KEY = "msg_tone";
const DM_TONE_KEY = "dm_tone";

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, string>;
    const toneKey = data?.conversationId ? DM_TONE_KEY : MSG_TONE_KEY;
    const toneId = await AsyncStorage.getItem(toneKey) ?? "synth";
    const useSystemSound = toneId === "system";
    return {
      shouldShowAlert: true,
      shouldPlaySound: useSystemSound,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Play the user's selected notification tone
 * @param type "msg" for team messages, "dm" for direct messages
 */
export async function playNotificationTone(type: "msg" | "dm" = "msg"): Promise<void> {
  try {
    const key = type === "dm" ? DM_TONE_KEY : MSG_TONE_KEY;
    const toneId = await AsyncStorage.getItem(key) ?? "synth";

    if (toneId === "system") return; // OS handles it via shouldPlaySound: true

    const tone = TONES.find(t => t.id === toneId);
    if (!tone?.url) return; // "none" selected or not found

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: tone.url },
      { shouldPlay: true, volume: 1 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {
    // Non-critical - silently fail
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulator/emulator — skip silently
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4361EE",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // Save token to backend
  try {
    await api.post("/api/push-token", { token });
  } catch {
    // Non-critical
  }

  return token;
}
