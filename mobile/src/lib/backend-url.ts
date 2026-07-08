/** Normalized API origin from EXPO_PUBLIC_BACKEND_URL (always includes https://). */
export function getBackendUrl(): string {
  const raw = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (!raw) {
    throw new Error("Missing EXPO_PUBLIC_BACKEND_URL");
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  return `https://${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}
