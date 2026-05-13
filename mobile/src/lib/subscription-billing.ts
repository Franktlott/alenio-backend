import { Linking } from "react-native";
import Purchases from "react-native-purchases";
import { isRevenueCatEnabled, TEAM_ENTITLEMENT_ID } from "./revenue-cat";

export type BillingSource = "stripe" | "app_store" | "play_store" | "other";

export type TeamBillingContext = {
  hasTeamEntitlement: boolean;
  /** Normalized channel for UI routing */
  billingSource: BillingSource | null;
  /** Raw RevenueCat store string e.g. STRIPE, APP_STORE */
  storeRaw: string | null;
  /** RevenueCat-provided URL: Stripe Customer Portal, App Store subscriptions, Play subscriptions, etc. */
  managementURL: string | null;
};

function mapStoreToBillingSource(store: string | null | undefined): BillingSource | null {
  if (!store) return null;
  switch (store) {
    case "STRIPE":
    case "PADDLE":
    case "RC_BILLING":
      return "stripe";
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play_store";
    default:
      return "other";
  }
}

/**
 * Reads Team entitlement + management URL from RevenueCat (authoritative for web vs in-app billing).
 */
export async function getTeamBillingContext(): Promise<TeamBillingContext | null> {
  if (!isRevenueCatEnabled()) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const ent = info.entitlements.active[TEAM_ENTITLEMENT_ID];
    const managementURL = info.managementURL ?? null;
    if (!ent) {
      return {
        hasTeamEntitlement: false,
        billingSource: null,
        storeRaw: null,
        managementURL,
      };
    }
    const storeRaw = ent.store ?? null;
    return {
      hasTeamEntitlement: true,
      billingSource: mapStoreToBillingSource(storeRaw),
      storeRaw,
      managementURL,
    };
  } catch {
    return null;
  }
}

export function billingSourceLabel(source: BillingSource | null): string {
  switch (source) {
    case "stripe":
      return "Web (Stripe)";
    case "app_store":
      return "App Store";
    case "play_store":
      return "Google Play";
    case "other":
      return "Other";
    default:
      return "—";
  }
}

/**
 * Hosts allowed inside an embedded WebView for payment portals (Stripe).
 */
export function isStripePortalEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h === "stripe.com" || h.endsWith(".stripe.com")) return true;
    if (h === "stripe.network" || h.endsWith(".stripe.network")) return true;
    if (h === "billing.stripe.com" || h.endsWith(".billing.stripe.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Use in-app WebView for Stripe (and similar HTTPS portals); native store sheets for IAP. */
export function shouldUseEmbeddedBillingWebView(source: BillingSource | null, url: string | null): boolean {
  if (!url) return false;
  if (source === "stripe") return isStripePortalEmbedUrl(url);
  if (source === "other") return isStripePortalEmbedUrl(url);
  return false;
}

/**
 * Open App Store / Play subscription management (native).
 */
export async function openStoreSubscriptionManagement(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return { ok: false, error: "Cannot open subscription management on this device." };
    await Linking.openURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
