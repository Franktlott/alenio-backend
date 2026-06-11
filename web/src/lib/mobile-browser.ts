/** Phone-class mobile browser (not desktop). Tablets may still match Android tablets without "Mobile". */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}
