import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";

const SOFT_UPDATE_DISMISSED_KEY = "app_update_soft_dismissed_version";

export type AppVersionInfo = {
  latestVersion: string | null;
  minimumVersion: string;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
  /** Optional title from the backend for the update prompt. */
  updateTitle?: string | null;
  /** Release bullets from Railway (MOBILE_UPDATE_BULLETS). */
  bullets?: string[] | null;
};

/** Compare dotted versions like 1.0.03 — returns negative if a < b. */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function getInstalledAppVersion(): string {
  return Application.nativeApplicationVersion?.trim() || "0.0.0";
}

function androidPackageName(): string | null {
  return (
    Application.applicationId?.trim() ||
    Constants.expoConfig?.android?.package?.trim() ||
    null
  );
}

/** Prefer Railway store URLs; fall back to Play package / App Store search. */
export function getStoreUrl(info: AppVersionInfo): string | null {
  if (Platform.OS === "ios") {
    const configured = info.iosStoreUrl?.trim();
    if (configured) return configured;
    return "https://apps.apple.com/search?term=Alenio";
  }
  if (Platform.OS === "android") {
    const configured = info.androidStoreUrl?.trim();
    if (configured) return configured;
    const pkg = androidPackageName();
    if (pkg) return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
    return "https://play.google.com/store/search?q=Alenio&c=apps";
  }
  return info.iosStoreUrl?.trim() || info.androidStoreUrl?.trim() || null;
}

export async function openAppStore(info: AppVersionInfo): Promise<void> {
  const url = getStoreUrl(info);
  if (!url) {
    Alert.alert(
      "Update Alenio",
      "Open the App Store or Play Store and search for Alenio to install the latest version.",
    );
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Couldn’t open the store",
      "Open the App Store or Play Store and search for Alenio to update.",
    );
  }
}

export function isBelowMinimum(current: string, info: AppVersionInfo): boolean {
  const min = info.minimumVersion?.trim() || "0.0.0";
  return compareAppVersions(current, min) < 0;
}

export function isBehindLatest(current: string, info: AppVersionInfo): boolean {
  const latest = info.latestVersion?.trim();
  if (!latest) return false;
  return compareAppVersions(current, latest) < 0;
}

/** Release notes for the update prompt — Railway MOBILE_UPDATE_* only. */
export function resolveUpdateNotes(info: AppVersionInfo): {
  title: string | null;
  bullets: string[];
} {
  return {
    title: info.updateTitle?.trim() || null,
    bullets: (info.bullets ?? []).map((b) => b.trim()).filter(Boolean),
  };
}

export async function wasSoftUpdateDismissed(latestVersion: string): Promise<boolean> {
  const dismissed = await AsyncStorage.getItem(SOFT_UPDATE_DISMISSED_KEY);
  return dismissed === latestVersion;
}

export async function dismissSoftUpdate(latestVersion: string): Promise<void> {
  await AsyncStorage.setItem(SOFT_UPDATE_DISMISSED_KEY, latestVersion);
}
