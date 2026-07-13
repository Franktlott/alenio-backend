import { getWebApiBase } from "./api-base";

/** Resolve stored profile/team image paths to a browser-loadable URL. */
export function resolveUserImageUrl(image?: string | null): string | null {
  if (!image?.trim()) return null;
  const trimmed = image.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("/")) {
    const base = getWebApiBase().replace(/\/$/, "");
    return base ? `${base}${trimmed}` : trimmed;
  }
  return trimmed;
}

export function userInitials(user: { name?: string | null; email?: string | null }): string {
  const label = user.name?.trim() || user.email?.trim() || "";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return "?";
}
