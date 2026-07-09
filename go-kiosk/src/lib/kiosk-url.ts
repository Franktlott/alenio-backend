const DEFAULT_WEB_URL = "https://alenio.app";

export function goWebBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_GO_WEB_URL?.trim() || DEFAULT_WEB_URL;
  return raw.replace(/\/$/, "");
}

export function kioskEntryUrl(hubToken?: string | null): string {
  const base = goWebBaseUrl();
  const token = hubToken?.trim();
  if (token) return `${base}/checklist/${encodeURIComponent(token)}`;
  return `${base}/aleniogo`;
}

export function isAllowedKioskUrl(url: string): boolean {
  try {
    const allowed = new URL(goWebBaseUrl());
    const target = new URL(url);
    return target.origin === allowed.origin;
  } catch {
    return false;
  }
}

export function parseHubTokenFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/checklist\/([^/]+)/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export const SYNC_LINKED_WORKSPACE_JS = `
(function () {
  try {
    var hubToken = localStorage.getItem("alenio.go.hubToken");
    var teamName = localStorage.getItem("alenio.go.teamName");
    if (!hubToken || !teamName || !window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: "workspace-linked", hubToken: hubToken, teamName: teamName })
    );
  } catch (e) {}
})();
true;
`;
