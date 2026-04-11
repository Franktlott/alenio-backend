import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { Platform } from "react-native";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

export function isRevenueCatEnabled(): boolean {
  const key = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
  return key.length > 0;
}

export function initRevenueCat(userId?: string) {
  if (!isRevenueCatEnabled()) return;
  try {
    const key = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: key, appUserID: userId ?? null });
  } catch (e) {
    console.warn("[RevenueCat] init failed", e);
  }
}

export async function purchaseTeam(): Promise<{ success: boolean; error?: string }> {
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) return { success: false, error: "No offerings available. Check RevenueCat dashboard." };
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = typeof customerInfo.entitlements.active["team"] !== "undefined";
    return { success: isActive };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, error: "cancelled" };
    return { success: false, error: e?.message ?? "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<{ success: boolean; isTeam: boolean }> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isTeam = typeof customerInfo.entitlements.active["team"] !== "undefined";
    return { success: true, isTeam };
  } catch (e) {
    return { success: false, isTeam: false };
  }
}
