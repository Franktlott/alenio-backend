const DEVICE_ID_KEY = "alenio.go.deviceId";
const LINKED_HUB_KEY = "alenio.go.hubToken";
const LINKED_TEAM_KEY = "alenio.go.teamName";
const LINKED_HERO_KEY = "alenio.go.hubHeroImage";
const PENDING_REQUEST_KEY = "alenio.go.pendingRequest";

export function getGoDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function defaultGoDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "Web browser";
}

export type GoLinkedWorkspace = {
  hubToken: string;
  teamName: string;
};

export function loadGoLinkedWorkspace(): GoLinkedWorkspace | null {
  if (typeof window === "undefined") return null;
  const hubToken = localStorage.getItem(LINKED_HUB_KEY);
  const teamName = localStorage.getItem(LINKED_TEAM_KEY);
  if (!hubToken || !teamName) return null;
  return { hubToken, teamName };
}

export function saveGoLinkedWorkspace(hubToken: string, teamName: string, heroImage?: string | null): void {
  localStorage.setItem(LINKED_HUB_KEY, hubToken);
  localStorage.setItem(LINKED_TEAM_KEY, teamName);
  localStorage.removeItem(PENDING_REQUEST_KEY);
  if (heroImage?.trim()) {
    localStorage.setItem(LINKED_HERO_KEY, heroImage.trim());
  } else {
    localStorage.removeItem(LINKED_HERO_KEY);
  }
}

export function clearGoLinkedWorkspace(): void {
  localStorage.removeItem(LINKED_HUB_KEY);
  localStorage.removeItem(LINKED_TEAM_KEY);
  localStorage.removeItem(LINKED_HERO_KEY);
  localStorage.removeItem(PENDING_REQUEST_KEY);
}

export type GoPendingLink = {
  requestId: string;
  teamName: string;
};

export function saveGoPendingLink(pending: GoPendingLink): void {
  localStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(pending));
}

export function loadGoPendingLink(): GoPendingLink | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PENDING_REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoPendingLink;
    if (parsed?.requestId && parsed?.teamName) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearGoPendingLink(): void {
  localStorage.removeItem(PENDING_REQUEST_KEY);
}
