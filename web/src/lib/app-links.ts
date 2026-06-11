const APP_SCHEME = (import.meta.env.VITE_APP_SCHEME as string | undefined)?.trim() || "alenio";

const IOS_STORE_URL = trim(import.meta.env.VITE_IOS_APP_STORE_URL as string | undefined);
const ANDROID_STORE_URL = trim(import.meta.env.VITE_ANDROID_PLAY_STORE_URL as string | undefined);

function trim(v: string | undefined): string {
  return v?.trim() ?? "";
}

export function getAppScheme(): string {
  return APP_SCHEME;
}

export function getInviteAppUrl(token: string): string {
  return `${APP_SCHEME}://invite/${encodeURIComponent(token.trim())}`;
}

export function getSignInAppUrl(email?: string): string {
  const base = `${APP_SCHEME}://sign-in`;
  const e = email?.trim().toLowerCase();
  if (!e) return base;
  return `${base}?email=${encodeURIComponent(e)}`;
}

export function getIosAppStoreUrl(): string {
  return IOS_STORE_URL;
}

export function getAndroidPlayStoreUrl(): string {
  return ANDROID_STORE_URL;
}

export function getMobileStoreUrl(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad/i.test(ua)) return IOS_STORE_URL;
  if (/Android/i.test(ua)) return ANDROID_STORE_URL;
  return IOS_STORE_URL || ANDROID_STORE_URL;
}

const HANDOFF_EMAIL_KEY = "alenio_mobile_handoff_email";
const MOBILE_WEB_OK_KEY = "alenio_mobile_web_preferred";

export function setMobileWebPreferred() {
  try {
    sessionStorage.setItem(MOBILE_WEB_OK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasMobileWebPreferred(): boolean {
  try {
    return sessionStorage.getItem(MOBILE_WEB_OK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMobileHandoffEmail(email: string) {
  try {
    sessionStorage.setItem(HANDOFF_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* ignore */
  }
}

export function getMobileHandoffEmail(): string {
  try {
    return sessionStorage.getItem(HANDOFF_EMAIL_KEY)?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export function clearMobileHandoffEmail() {
  try {
    sessionStorage.removeItem(HANDOFF_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

/** Try to open the native app; returns immediately (OS handles handoff). */
export function openNativeApp(url: string) {
  window.location.href = url;
}
