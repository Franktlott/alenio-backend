export type AcceptedConnectionPair = { requesterId: string; recipientId: string };

export const PUBLIC_PROFILE_LIMITS = {
  profileWebsite: 2048,
  profileLocation: 100,
  profileBio: 500,
} as const;

export type PublicProfileField = keyof typeof PUBLIC_PROFILE_LIMITS;

export function validatePublicProfileUpdate(
  input: Partial<Record<PublicProfileField, unknown>>,
):
  | { ok: true; data: Partial<Record<PublicProfileField, string | null>> }
  | { ok: false; message: string } {
  const data: Partial<Record<PublicProfileField, string | null>> = {};
  for (const field of Object.keys(PUBLIC_PROFILE_LIMITS) as PublicProfileField[]) {
    const value = input[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      return { ok: false, message: `${field} must be text.` };
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (field === "profileWebsite" && trimmed) {
      const website = normalizeProfileWebsite(trimmed);
      if (!website) {
        return { ok: false, message: "profileWebsite must be a valid website." };
      }
      if (website.length > PUBLIC_PROFILE_LIMITS.profileWebsite) {
        return {
          ok: false,
          message: `profileWebsite must be ${PUBLIC_PROFILE_LIMITS.profileWebsite} characters or fewer.`,
        };
      }
      data.profileWebsite = website;
      continue;
    }
    if (trimmed.length > PUBLIC_PROFILE_LIMITS[field]) {
      return {
        ok: false,
        message: `${field} must be ${PUBLIC_PROFILE_LIMITS[field]} characters or fewer.`,
      };
    }
    data[field] = trimmed || null;
  }
  return { ok: true, data };
}

/** Canonicalize a public website to HTTPS and reject non-public or unsafe URLs. */
export function normalizeProfileWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed.replace(/^http:\/\//i, "https://")
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !hostname.includes(".") ||
      hostname.startsWith(".") ||
      hostname.endsWith(".")
    ) {
      return null;
    }
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

/** Count unique accepted connections shared by the viewer and profile owner. */
export function countMutualConnections(
  viewerId: string,
  personId: string,
  viewerRows: AcceptedConnectionPair[],
  personRows: AcceptedConnectionPair[],
): number {
  const viewerConnections = new Set(
    viewerRows.map((row) => (row.requesterId === viewerId ? row.recipientId : row.requesterId)),
  );
  const mutual = new Set<string>();
  for (const row of personRows) {
    const otherId = row.requesterId === personId ? row.recipientId : row.requesterId;
    if (otherId !== viewerId && viewerConnections.has(otherId)) mutual.add(otherId);
  }
  return mutual.size;
}
