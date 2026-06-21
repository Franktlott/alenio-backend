const KIOSK_INSTALL_DISMISSED_KEY = "alenio-kiosk-install-dismissed";

export function isKioskStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isKioskInstallDismissed(): boolean {
  try {
    return localStorage.getItem(KIOSK_INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissKioskInstallHint(): void {
  try {
    localStorage.setItem(KIOSK_INSTALL_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isIosTabletOrPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export function canRequestFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export async function enterKioskFullscreen(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function mountChecklistWebManifest(): void {
  if (typeof document === "undefined") return;
  let link = document.querySelector('link[rel="manifest"][data-checklist-pwa]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    link.setAttribute("data-checklist-pwa", "1");
    document.head.appendChild(link);
  }
  link.href = "/checklist.webmanifest";

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* optional */
    });
  }
}
