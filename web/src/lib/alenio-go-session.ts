const SESSION_KEY = "alenioGo.sessionToken";
const PENDING_CODE_KEY = "alenioGo.pendingCode";
const PENDING_LOCATION_KEY = "alenioGo.pendingLocation";

export type PendingGoLocation = {
  id: string;
  name: string;
  area: string | null;
  guestEnabled: boolean;
  workspaceName: string;
  workspaceImage: string | null;
  quickUsers: string[];
  goCode: string;
};

export function getGoSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setGoSessionToken(token: string) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.removeItem(PENDING_CODE_KEY);
  localStorage.removeItem(PENDING_LOCATION_KEY);
}

export function clearGoSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PENDING_CODE_KEY);
  localStorage.removeItem(PENDING_LOCATION_KEY);
}

export function setPendingGoCode(code: string) {
  localStorage.setItem(PENDING_CODE_KEY, code);
}

export function getPendingGoCode(): string | null {
  try {
    return localStorage.getItem(PENDING_CODE_KEY);
  } catch {
    return null;
  }
}

export function setPendingGoLocation(location: PendingGoLocation) {
  localStorage.setItem(PENDING_LOCATION_KEY, JSON.stringify(location));
  localStorage.setItem(PENDING_CODE_KEY, location.goCode);
}

export function getPendingGoLocation(): PendingGoLocation | null {
  try {
    const raw = localStorage.getItem(PENDING_LOCATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingGoLocation;
  } catch {
    return null;
  }
}

export function normalizeGoCodeInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function parseGoCodeFromUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get("code") ?? params.get("goCode") ?? "";
  const normalized = normalizeGoCodeInput(code);
  return normalized.length >= 4 ? normalized : null;
}

export function alenioGoEntryUrl(goCode: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/aleniogo?code=${encodeURIComponent(goCode)}`;
  }
  return `/aleniogo?code=${encodeURIComponent(goCode)}`;
}
