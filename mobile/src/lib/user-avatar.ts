const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "";

export function resolveUserImageUrl(image?: string | null): string | null {
  if (!image?.trim()) return null;
  const trimmed = image.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && backendUrl) return `${backendUrl}${trimmed}`;
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

export function dmOtherParticipant(
  conv: {
    recipient?: { id: string; name?: string | null; email?: string | null; image?: string | null } | null;
    participants?: { id: string; name?: string | null; email?: string | null; image?: string | null }[];
  },
  currentUserId: string,
) {
  if (conv.recipient) return conv.recipient;
  return conv.participants?.find((p) => p.id !== currentUserId) ?? null;
}
