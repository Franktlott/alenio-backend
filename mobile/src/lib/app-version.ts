import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { getWhatsNewForVersion } from "@/lib/whats-new";

const SOFT_UPDATE_DISMISSED_KEY = "app_update_soft_dismissed_version";

export type AppVersionInfo = {
  latestVersion: string | null;
  minimumVersion: string;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
  /** Optional title from the backend for the update prompt. */
  updateTitle?: string | null;
  /** Release bullets from the backend (preferred for old builds). */
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

export function getStoreUrl(info: AppVersionInfo): string | null {
  if (Platform.OS === "ios") return info.iosStoreUrl?.trim() || null;
  if (Platform.OS === "android") return info.androidStoreUrl?.trim() || null;
  return info.iosStoreUrl?.trim() || info.androidStoreUrl?.trim() || null;
}

export async function openAppStore(info: AppVersionInfo): Promise<void> {
  const url = getStoreUrl(info);
  if (!url) return;
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
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

/**
 * Prefer backend bullets (reach old installs). Fall back to local whats-new.ts
 * when the latest version entry exists in this JS bundle (dev / OTA).
 */
export function resolveUpdateNotes(info: AppVersionInfo): {
  title: string | null;
  bullets: string[];
} {
  const fromApi = (info.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  if (fromApi.length > 0) {
    return {
      title: info.updateTitle?.trim() || null,
      bullets: fromApi,
    };
  }
  const latest = info.latestVersion?.trim();
  if (!latest) return { title: null, bullets: [] };
  const local = getWhatsNewForVersion(latest);
  if (!local) return { title: info.updateTitle?.trim() || null, bullets: [] };
  return {
    title: info.updateTitle?.trim() || local.title,
    bullets: local.bullets,
  };
}

export async function wasSoftUpdateDismissed(latestVersion: string): Promise<boolean> {
  const dismissed = await AsyncStorage.getItem(SOFT_UPDATE_DISMISSED_KEY);
  return dismissed === latestVersion;
}

export async function dismissSoftUpdate(latestVersion: string): Promise<void> {
  await AsyncStorage.setItem(SOFT_UPDATE_DISMISSED_KEY, latestVersion);
}
