const MAX_LEADER_PREP_ITEMS = 8;
const MAX_LEADER_PREP_LENGTH = 200;

export function parseLeaderPrep(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_LEADER_PREP_ITEMS);
  } catch {
    return [];
  }
}

export function normalizeLeaderPrep(items: string[] | null | undefined): string[] {
  return (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LEADER_PREP_ITEMS)
    .map((item) => item.slice(0, MAX_LEADER_PREP_LENGTH));
}

export function serializeLeaderPrep(items: string[] | null | undefined): string | null {
  const normalized = normalizeLeaderPrep(items);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}
