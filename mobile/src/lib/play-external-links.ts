import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/** Play Billing response codes we act on. */
const OK = 0;
const USER_CANCELED = 1;

type NativeResult = { code: number; message: string; token: string | null };

type PlayExternalLinksNative = {
  checkAvailability(): Promise<NativeResult>;
  createToken(): Promise<NativeResult>;
  showNotice(url: string, token: string): Promise<NativeResult>;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<PlayExternalLinksNative>("PlayExternalLinks") : null;

export class PlayCheckoutUnavailableError extends Error {
  constructor() {
    super("Subscriptions can't be started in the Android app here. Your workspace owner can manage the plan.");
    this.name = "PlayCheckoutUnavailableError";
  }
}

export class PlayCheckoutCanceledError extends Error {
  constructor() {
    super("Checkout canceled.");
    this.name = "PlayCheckoutCanceledError";
  }
}

export function isPlayCheckoutCanceled(error: unknown): boolean {
  return error instanceof PlayCheckoutCanceledError;
}

/** On Android every paid checkout goes through Google Play's external content links program. */
export function needsPlayCheckoutGate(): boolean {
  return Platform.OS === "android";
}

/**
 * Android only: confirms the user can be linked out (US + enrolled) and returns a fresh
 * single-use token for the server to report the sale with. Throws when linking out isn't allowed.
 */
export async function preparePlayCheckout(): Promise<string> {
  if (!native) throw new PlayCheckoutUnavailableError();
  const available = await native.checkAvailability();
  if (available.code !== OK) {
    console.warn("[play-links] not available", available.code, available.message);
    throw new PlayCheckoutUnavailableError();
  }
  const created = await native.createToken();
  if (created.code !== OK || !created.token) {
    console.warn("[play-links] token failed", created.code, created.message);
    throw new PlayCheckoutUnavailableError();
  }
  return created.token;
}

/** Shows Google's "leaving Google Play" notice; resolves when the app may open the checkout. */
export async function confirmPlayCheckout(url: string, token: string): Promise<void> {
  if (!native) throw new PlayCheckoutUnavailableError();
  const shown = await native.showNotice(url, token);
  if (shown.code === OK) return;
  if (shown.code === USER_CANCELED) throw new PlayCheckoutCanceledError();
  console.warn("[play-links] notice failed", shown.code, shown.message);
  throw new PlayCheckoutUnavailableError();
}
