import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";

const LAST_SEEN_KEY = "whats_new_last_seen_version";

export type WhatsNewEntry = {
  title: string;
  bullets: string[];
};

/**
 * Write 2–5 short bullets here whenever you bump expo.version in app.json.
 *
 * - After users update: shown once by the What’s New modal for that version.
 * - On the “Update available” prompt: used as a fallback when Railway has no
 *   MOBILE_UPDATE_BULLETS yet. Old production installs need Railway bullets.
 */
export const WHATS_NEW_BY_VERSION: Record<string, WhatsNewEntry> = {
  "1.0.03": {
    title: "What’s new in Alenio",
    bullets: [
      "Pin important chat messages and jump back to them anytime",
      "Photos you remove from chats and profiles are cleaned up from storage",
      "Clearer group member management for owners and admins",
    ],
  },
  // Dev / test: matches MOBILE_LATEST_VERSION=9.9.9 so the update modal shows bullets locally.
  "9.9.9": {
    title: "What’s new in this update",
    bullets: [
      "Pin important chat messages and jump back to them anytime",
      "Photos you remove from chats and profiles are cleaned up from storage",
      "Clearer group member management for owners and admins",
    ],
  },
};

export function getAppVersion(): string {
  return Application.nativeApplicationVersion?.trim() || "0.0.0";
}

export function getWhatsNewForVersion(version: string): WhatsNewEntry | null {
  return WHATS_NEW_BY_VERSION[version] ?? null;
}

/**
 * First install: remember version silently (no modal).
 * Upgrade with notes: show modal.
 */
export async function resolveWhatsNewPrompt(): Promise<{
  version: string;
  entry: WhatsNewEntry;
} | null> {
  const version = getAppVersion();
  const entry = getWhatsNewForVersion(version);
  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);

  if (!lastSeen) {
    await AsyncStorage.setItem(LAST_SEEN_KEY, version);
    return null;
  }

  if (lastSeen === version || !entry) {
    if (lastSeen !== version && !entry) {
      await AsyncStorage.setItem(LAST_SEEN_KEY, version);
    }
    return null;
  }

  return { version, entry };
}

export async function markWhatsNewSeen(version: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, version);
}
