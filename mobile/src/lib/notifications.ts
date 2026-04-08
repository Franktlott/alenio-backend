import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api/api";

// Tone configuration (must match profile.tsx)
const TONES = [
  { id: "none",       label: "None",       url: null },
  { id: "bell",       label: "Default",    url: "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3" },
  { id: "tritone",    label: "Tri-tone",   url: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3" },
  { id: "chime",      label: "Chime",      url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
  { id: "glass",      label: "Glass",      url: "https://assets.mixkit.co/active_storage/sfx/2308/2308-preview.mp3" },
  { id: "aurora",     label: "Aurora",     url: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3" },
  { id: "chord",      label: "Chord",      url: "https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3" },
  { id: "circles",    label: "Circles",    url: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3" },
  { id: "complete",   label: "Complete",   url: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3" },
  { id: "note",       label: "Note",       url: "https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3" },
  { id: "popcorn",    label: "Popcorn",    url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" },
  { id: "pulse",      label: "Pulse",      url: "https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3" },
  { id: "synth",      label: "Synth",      url: "https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3" },
];

const MSG_TONE_KEY = "msg_tone";
const DM_TONE_KEY = "dm_tone";

// Show notifications when app is in foreground (but don't play system sound - we handle it ourselves)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false, // We play custom sound instead
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Play the user's selected notification tone
 * @param type "msg" for team messages, "dm" for direct messages
 */
export async function playNotificationTone(type: "msg" | "dm" = "msg"): Promise<void> {
  try {
    const key = type === "dm" ? DM_TONE_KEY : MSG_TONE_KEY;
    const toneId = await AsyncStorage.getItem(key) ?? "bell";

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
